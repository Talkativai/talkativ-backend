import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as elevenlabs from '../services/elevenlabs.service.js';
import * as twilioService from '../services/twilio.service.js';

// ─── Helper ──────────────────────────────────────────────────────────────────
const getBusinessByUserId = async (userId: string) => {
  const biz = await prisma.business.findUnique({ where: { userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  return biz;
};

// ─── Get Business ─────────────────────────────────────────────────────────────
export const getBusiness = asyncHandler(async (req: Request, res: Response) => {
  const biz = await getBusinessByUserId(req.user!.userId);
  const business = await prisma.business.findUnique({
    where: { id: biz.id },
    include: { orderingPolicy: true, reservationPolicy: true, notifSettings: true, phoneConfig: true },
  });
  res.json(business);
});

// ─── Update Business ──────────────────────────────────────────────────────────
export const updateBusiness = asyncHandler(async (req: Request, res: Response) => {
  const biz = await getBusinessByUserId(req.user!.userId);
  const updated = await prisma.business.update({ where: { id: biz.id }, data: req.body });
  res.json(updated);
});

// ─── Update Onboarding ────────────────────────────────────────────────────────
export const updateOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const biz = await getBusinessByUserId(req.user!.userId);
  const updated = await prisma.business.update({
    where: { id: biz.id },
    data: { ...req.body, onboardingStep: Math.max(biz.onboardingStep, 2) },
  });
  res.json(updated);
});

// ─── Complete Onboarding ──────────────────────────────────────────────────────
export const completeOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const biz = await getBusinessByUserId(req.user!.userId);

  const business = await prisma.business.findUnique({
    where: { id: biz.id },
    include: { agent: true },
  });
  if (!business) throw ApiError.notFound('Business not found');

  // Mark onboarding as done
  const updated = await prisma.business.update({
    where: { id: business.id },
    data: { ...req.body, onboardingDone: true, onboardingStep: 999 },
  });

  // Create trial subscription if none exists
  try {
    const existingSub = await prisma.subscription.findUnique({ where: { businessId: business.id } });
    if (!existingSub) {
      await prisma.subscription.create({
        data: {
          businessId: business.id,
          status: 'TRIALING',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }
  } catch (e) {
    console.error('Subscription creation failed:', e);
  }

  // Create ElevenLabs agent if not already created
  if (!business.agent?.elevenlabsAgentId) {
    try {
      const agentName = business.agent?.name || 'Aria';
      const voiceId = business.agent?.voiceId || '21m00Tcm4TlvDq8ikWAM';
      const greeting = business.agent?.openingGreeting
        || `Thank you for calling ${updated.name}, this is ${agentName}. How can I help you today?`;

      // Fetch FAQs, ordering policy and reservation policy
      const [faqs, orderingPolicy, reservationPolicy, menuCategories] = await Promise.all([
        prisma.faq.findMany({ where: { businessId: business.id }, orderBy: { position: 'asc' } }),
        prisma.orderingPolicy.findUnique({ where: { businessId: business.id } }),
        prisma.reservationPolicy.findUnique({ where: { businessId: business.id } }),
        prisma.menuCategory.findMany({
          where: { businessId: business.id },
          include: { items: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        }),
      ]);

      const systemPrompt = elevenlabs.buildSystemPrompt({
        name: updated.name,
        type: updated.type,
        address: updated.address,
        openingHours: updated.openingHours,
        agentName,
        greeting,
        businessId: business.id,
        faqs,
        orderingPolicy,
        reservationPolicy,
        menuCategories,
        agent: {
          transferEnabled: business.agent?.transferEnabled ?? true,
          transferNumber: business.agent?.transferNumber ?? updated.phone ?? undefined,
          openingGreeting: business.agent?.openingGreeting,
        },
      });

      const elAgent = await elevenlabs.createAgent({
        name: `${updated.name} - ${agentName}`,
        systemPrompt,
        firstMessage: greeting,
        voiceId,
        businessId: business.id,
        transferEnabled: business.agent?.transferEnabled ?? true,
        transferNumber: business.agent?.transferNumber ?? updated.phone ?? undefined,
      });

      await prisma.agent.upsert({
        where: { businessId: business.id },
        update: { elevenlabsAgentId: elAgent.agent_id, systemPrompt },
        create: {
          businessId: business.id,
          name: agentName,
          voiceId,
          elevenlabsAgentId: elAgent.agent_id,
          systemPrompt,
        },
      });

      // Connect phone number to agent
      try {
        const phoneConfig = await prisma.phoneConfig.findUnique({ where: { businessId: business.id } });

        if (phoneConfig?.assignedNumber) {
          await twilioService.connectNumberToAgent(phoneConfig.assignedNumber, elAgent.agent_id);
          await prisma.agent.update({
            where: { businessId: business.id },
            data: { aiPhoneNumber: phoneConfig.assignedNumber },
          });
        } else {
          const countryCode = twilioService.detectCountryFromAddress(updated.address || '');
          const phoneNumber = await twilioService.buyPhoneNumber(countryCode);
          if (phoneNumber) {
            await twilioService.connectNumberToAgent(phoneNumber, elAgent.agent_id);
            await prisma.agent.update({
              where: { businessId: business.id },
              data: { aiPhoneNumber: phoneNumber },
            });
            await prisma.phoneConfig.upsert({
              where: { businessId: business.id },
              update: { assignedNumber: phoneNumber },
              create: { businessId: business.id, assignedNumber: phoneNumber },
            });
          }
        }
      } catch (e) {
        console.error('Phone number connection failed:', e);
      }
    } catch (e) {
      console.error('ElevenLabs agent creation failed:', e);
    }
  }

  res.json({ success: true, business: updated });
});

// ─── Phone setup during onboarding ───────────────────────────────────────────
export const setupPhone = asyncHandler(async (req: Request, res: Response) => {
  const biz = await getBusinessByUserId(req.user!.userId);

  const { mode, countryCode } = req.body as { mode: 'forward' | 'new'; countryCode?: string };

  let assignedNumber: string | null = null;

  if (mode === 'new') {
    const detectedCountry = twilioService.detectCountryFromAddress(biz.address || '');
    assignedNumber = await twilioService.buyPhoneNumber(countryCode || detectedCountry);
  }

  const config = await prisma.phoneConfig.upsert({
    where: { businessId: biz.id },
    update: { ...(mode === 'new' ? { assignedNumber } : {}) },
    create: { businessId: biz.id, assignedNumber: mode === 'new' ? assignedNumber : null },
  });

  res.json({ assignedNumber: config.assignedNumber });
});
