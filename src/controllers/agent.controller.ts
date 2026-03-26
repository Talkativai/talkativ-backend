import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as elevenlabs from '../services/elevenlabs.service.js';
import { AVAILABLE_VOICES } from '../utils/constants.js';

const getBusinessId = async (userId: string) => {
  const business = await prisma.business.findUnique({ where: { userId } });
  if (!business) throw ApiError.notFound('Business not found');
  return business.id;
};

export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const agent = await prisma.agent.findUnique({ where: { businessId } });
  if (!agent) throw ApiError.notFound('Agent not configured');
  res.json(agent);
});

export const updateAgent = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({
    where: { userId: req.user!.userId },
    include: { agent: true },
  });
  if (!business) throw ApiError.notFound('Business not found');

  const agent = await prisma.agent.upsert({
    where: { businessId: business.id },
    update: req.body,
    create: { businessId: business.id, ...req.body },
  });

  // If no ElevenLabs agent exists yet, create one with all four tools registered
  if (!agent.elevenlabsAgentId) {
    try {
      const systemPrompt = elevenlabs.buildSystemPrompt({
        name: business.name,
        type: business.type || 'restaurant',
        address: business.address || '',
        openingHours: business.openingHours,
        agentName: agent.name,
        transferNumber: agent.transferNumber ?? undefined,
        greeting: agent.openingGreeting,
      });
      const created = await elevenlabs.createAgent({
        name: agent.name,
        systemPrompt,
        firstMessage: agent.openingGreeting,
        voiceId: agent.voiceId,
        businessId: business.id,
      });
      await prisma.agent.update({
        where: { businessId: business.id },
        data: { elevenlabsAgentId: created.agent_id },
      });
    } catch (e) {
      console.error('ElevenLabs createAgent failed:', e);
    }
  } else {
    // Agent already exists in ElevenLabs — push the update
    try {
      await elevenlabs.updateAgent(agent.elevenlabsAgentId, req.body);
    } catch (e) {
      console.error('ElevenLabs updateAgent failed:', e);
    }
  }

  res.json(agent);
});

export const updateVoice = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const agent = await prisma.agent.update({
    where: { businessId },
    data: { voiceId: req.body.voiceId, voiceName: req.body.voiceName },
  });
  res.json(agent);
});

export const updateScript = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const agent = await prisma.agent.update({
    where: { businessId },
    data: req.body,
  });
  res.json(agent);
});

export const updateCallRules = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const agent = await prisma.agent.update({
    where: { businessId },
    data: req.body,
  });
  res.json(agent);
});

export const getVoices = asyncHandler(async (_req: Request, res: Response) => {
  res.json(AVAILABLE_VOICES);
});

export const getTranscripts = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const calls = await prisma.call.findMany({
    where: { businessId, transcript: { not: null } },
    select: { id: true, callerName: true, callerPhone: true, startedAt: true, duration: true, transcript: true, outcome: true, outcomeType: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  res.json(calls);
});

export const getTranscriptById = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const id = req.params.id as string;

  const call = await prisma.call.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      callerName: true,
      callerPhone: true,
      startedAt: true,
      endedAt: true,
      duration: true,
      transcript: true,
      outcome: true,
      outcomeType: true,
      elevenlabsConvId: true,
    },
  });

  if (!call) throw ApiError.notFound('Call not found');
  res.json(call);
});

export const testCall = asyncHandler(async (req: Request, res: Response) => {
  // In production: trigger ElevenLabs outbound test call
  res.json({ message: 'Test call initiated', status: 'pending' });
});
