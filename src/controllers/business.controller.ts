import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as elevenlabs from '../services/elevenlabs.service.js';
import * as twilioService from '../services/twilio.service.js';
import * as emailService from '../services/email.service.js';

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
          // Register/re-register with ElevenLabs to ensure this agent handles the number
          await elevenlabs.registerPhoneNumber(phoneConfig.assignedNumber, elAgent.agent_id);
          await twilioService.connectNumberToAgent(phoneConfig.assignedNumber, elAgent.agent_id);
          await prisma.agent.update({
            where: { businessId: business.id },
            data: { aiPhoneNumber: phoneConfig.assignedNumber },
          });
        } else {
          const countryCode = twilioService.detectCountryFromAddress(updated.address || '');
          const phoneNumber = await twilioService.buyPhoneNumber(countryCode);
          if (phoneNumber) {
            await elevenlabs.registerPhoneNumber(phoneNumber, elAgent.agent_id);
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

  // Send congratulations/walkthrough email
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { email: true, firstName: true } });
    const agentRecord = await prisma.agent.findUnique({ where: { businessId: business.id }, select: { name: true } });
    if (user) {
      emailService.sendOnboardingCompleteEmail(
        user.email,
        user.firstName || 'there',
        agentRecord?.name || 'your agent',
        updated.name,
      ).catch(() => {});
    }
  } catch {}

  res.json({ success: true, business: updated });
});

// ─── Phone setup during onboarding ───────────────────────────────────────────
export const setupPhone = asyncHandler(async (req: Request, res: Response) => {
  const biz = await getBusinessByUserId(req.user!.userId);

  const { mode, countryCode } = req.body as { mode: 'forward' | 'new'; countryCode?: string };

  let assignedNumber: string | null = null;

  if (mode === 'new') {
    // Resolve to a 2-letter ISO code for Twilio.
    // biz.country is stored as a full name ("Nigeria", "United Kingdom") not an ISO code,
    // so we always run it through detectCountryFromAddress which does the mapping.
    const rawHint = countryCode || biz.country || biz.address || '';
    const resolvedCountry = (rawHint.length <= 3 ? rawHint.toUpperCase() : null)
      || twilioService.detectCountryFromAddress(rawHint)
      || 'GB';

    assignedNumber = await twilioService.buyPhoneNumber(resolvedCountry);

    if (!assignedNumber) {
      throw ApiError.internal('NO_NUMBER_IN_REGION');
    }
  }

  const config = await prisma.phoneConfig.upsert({
    where: { businessId: biz.id },
    update: { ...(mode === 'new' ? { assignedNumber } : {}) },
    create: { businessId: biz.id, assignedNumber: mode === 'new' ? assignedNumber : null },
  });

  // If a number was provisioned, ensure an ElevenLabs agent exists and connect them.
  // This guarantees the Step 6 test call works before billing is complete.
  if (assignedNumber) {
    try {
      const agent = await prisma.agent.findUnique({ where: { businessId: biz.id } });
      let elevenlabsAgentId = agent?.elevenlabsAgentId;

      // No ElevenLabs agent yet (Step 4 save may have failed) — create a basic one now
      if (!elevenlabsAgentId) {
        const agentName = agent?.name || 'Aria';
        const voiceId   = agent?.voiceId || '21m00Tcm4TlvDq8ikWAM';
        const greeting  = agent?.openingGreeting
          || `Thank you for calling ${biz.name}, this is ${agentName}. How can I help you today?`;

        const systemPrompt = elevenlabs.buildSystemPrompt({
          name: biz.name,
          type: biz.type || 'restaurant',
          address: biz.address || '',
          openingHours: biz.openingHours,
          agentName,
          greeting,
        });

        const elAgent = await elevenlabs.createAgent({
          name: agentName,
          systemPrompt,
          firstMessage: greeting,
          voiceId,
          businessId: biz.id,
        });

        elevenlabsAgentId = elAgent.agent_id;

        await prisma.agent.upsert({
          where: { businessId: biz.id },
          update: { elevenlabsAgentId, systemPrompt },
          create: { businessId: biz.id, name: agentName, voiceId, elevenlabsAgentId, systemPrompt },
        });
      }

      // Register phone number with ElevenLabs (required for inbound call routing)
      await elevenlabs.registerPhoneNumber(assignedNumber, elevenlabsAgentId);

      // Also set voice URL directly on the Twilio number as a fallback
      await twilioService.connectNumberToAgent(assignedNumber, elevenlabsAgentId);
      await prisma.agent.update({
        where: { businessId: biz.id },
        data: { aiPhoneNumber: assignedNumber },
      });
    } catch (e) {
      console.error('Failed to connect number to agent during setup:', e);
      // Non-fatal — number is saved, completeOnboarding will retry connection
    }
  }

  res.json({ assignedNumber: config.assignedNumber });
});

