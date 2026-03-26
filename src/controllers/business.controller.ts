import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as elevenlabs from '../services/elevenlabs.service.js';

export const getBusiness = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({
    where: { userId: req.user!.userId },
    include: { orderingPolicy: true, reservationPolicy: true, notifSettings: true, phoneConfig: true },
  });
  if (!business) throw ApiError.notFound('Business not found');
  res.json(business);
});

export const updateBusiness = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!business) throw ApiError.notFound('Business not found');

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: req.body,
  });
  res.json(updated);
});

export const updateOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!business) throw ApiError.notFound('Business not found');

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: { ...req.body, onboardingStep: Math.max(business.onboardingStep, 2) },
  });
  res.json(updated);
});

export const completeOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({
    where: { userId: req.user!.userId },
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

      const systemPrompt = elevenlabs.buildSystemPrompt({
        name: updated.name,
        type: updated.type,
        address: updated.address,
        openingHours: updated.openingHours,
        agentName,
        transferNumber: business.agent?.transferNumber ?? updated.phone ?? undefined,
        greeting,
      });

      const elAgent = await elevenlabs.createAgent({
        name: `${updated.name} - ${agentName}`,
        systemPrompt,
        firstMessage: greeting,
        voiceId,
        businessId: business.id,
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
    } catch (e) {
      console.error('ElevenLabs agent creation failed:', e);
      // Non-fatal — agent can be retried later via updateAgent
    }
  }

  res.json({ success: true, business: updated });
});
