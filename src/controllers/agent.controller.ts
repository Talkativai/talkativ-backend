import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as elevenlabs from '../services/elevenlabs.service.js';
import { AVAILABLE_VOICES } from '../utils/constants.js';
import { env } from '../config/env.js';
import * as twilioService from '../services/twilio.service.js';

export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const agent = await prisma.agent.findUnique({ where: { businessId } });
  if (!agent) throw ApiError.notFound('Agent not configured');
  res.json(agent);
});

export const updateAgent = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const business = await prisma.business.findUnique({
    where: { id: businessId },
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
      const menuCategories = await prisma.menuCategory.findMany({
        where: { businessId: business.id },
        include: { items: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      });
      const systemPrompt = elevenlabs.buildSystemPrompt({
        name: business.name,
        type: business.type || 'restaurant',
        address: business.address || '',
        openingHours: business.openingHours,
        agentName: agent.name,
        transferNumber: agent.transferNumber ?? undefined,
        greeting: agent.openingGreeting,
        menuCategories,
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
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const agent = await prisma.agent.update({
    where: { businessId },
    data: { voiceId: req.body.voiceId, voiceName: req.body.voiceName },
  });
  res.json(agent);
});

export const updateScript = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const agent = await prisma.agent.update({
    where: { businessId },
    data: req.body,
  });
  res.json(agent);
});

export const updateCallRules = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
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
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const calls = await prisma.call.findMany({
    where: { businessId, transcript: { not: null } },
    select: { id: true, callerName: true, callerPhone: true, startedAt: true, duration: true, transcript: true, outcome: true, outcomeType: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  res.json(calls);
});

export const getTranscriptById = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
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
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  // Get agent and business details
  const agent = await prisma.agent.findUnique({ where: { businessId } });
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!agent?.elevenlabsAgentId) {
    throw ApiError.badRequest('Agent not configured — complete onboarding first');
  }

  // Get the phone number to call
  // Priority: number from request body → assigned agent number → business phone
  const { phoneNumber } = req.body;
  const toNumber = phoneNumber || agent.aiPhoneNumber || business?.phone;

  if (!toNumber) {
    throw ApiError.badRequest('No phone number available for test call');
  }

  // Make outbound call via Twilio
  const result = await twilioService.makeDemoCall(toNumber, agent.elevenlabsAgentId);

  if (!result.success) {
    throw ApiError.internal('Failed to initiate test call. Please try again.');
  }

  res.json({
    message: 'Test call initiated',
    status: 'calling',
    callingNumber: toNumber,
    callSid: result.callSid,
  });
});

export const getSignedUrl = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const agent = await prisma.agent.findUnique({ where: { businessId } });
  if (!agent?.elevenlabsAgentId) throw ApiError.notFound('Agent not configured — complete onboarding first');

  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agent.elevenlabsAgentId}`,
    { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } }
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`ElevenLabs signed URL failed: ${err}`);
  }
  const { signed_url } = await r.json() as { signed_url: string };
  res.json({ signedUrl: signed_url });
});

// ─── Auto-Sync Helper (push latest menu + settings to ElevenLabs) ────────────
export const autoSyncAgent = async (businessId: string): Promise<number> => {
  const [business, agent, menuCategories, faqs, orderingPolicy, reservationPolicy] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, include: { agent: true } }),
    prisma.agent.findUnique({ where: { businessId } }),
    prisma.menuCategory.findMany({
      where: { businessId },
      include: { items: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.faq.findMany({ where: { businessId }, orderBy: { position: 'asc' } }),
    prisma.orderingPolicy.findUnique({ where: { businessId } }),
    prisma.reservationPolicy.findUnique({ where: { businessId } }),
  ]);

  if (!business || !agent?.elevenlabsAgentId) {
    throw new Error('Agent not configured');
  }

  const systemPrompt = elevenlabs.buildSystemPrompt({
    name: business.name,
    type: business.type,
    address: business.address,
    openingHours: business.openingHours,
    agentName: agent.name,
    greeting: agent.openingGreeting,
    menuCategories,
    faqs,
    orderingPolicy,
    reservationPolicy,
    agent: {
      transferEnabled: agent.transferEnabled,
      transferNumber: agent.transferNumber ?? undefined,
      openingGreeting: agent.openingGreeting,
    },
  });

  // Push to ElevenLabs
  await elevenlabs.updateAgent(agent.elevenlabsAgentId, {
    conversation_config: {
      agent: { prompt: { prompt: systemPrompt } },
    },
  });

  // Save in DB so we have a record
  await prisma.agent.update({ where: { businessId }, data: { systemPrompt } });

  return menuCategories.reduce((n, c) => n + c.items.length, 0);
};

// ─── Rebuild system prompt endpoint ──────────────────────────────────────────
export const rebuildSystemPrompt = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  try {
    const menuItemCount = await autoSyncAgent(businessId);
    res.json({ success: true, menuItemCount });
  } catch (error: any) {
    if (error.message === 'Agent not configured') {
      throw ApiError.badRequest('Agent not configured — complete onboarding first');
    }
    throw error;
  }
});

export const previewVoice = async (req: Request, res: Response) => {
  const { voiceId, text } = req.body as { voiceId: string; text: string };
  if (!voiceId || !text) {
    res.status(400).json({ error: 'voiceId and text are required' });
    return;
  }
  try {
    const audioBuffer = await elevenlabs.textToSpeech(voiceId, text.slice(0, 500));
    res.json({ audio: audioBuffer.toString('base64') });
  } catch (err: any) {
    const raw = err?.message || '';
    console.error('[previewVoice] ElevenLabs error:', raw);

    let userMessage = 'Voice preview is currently unavailable.';

    if (raw.includes('detected_unusual_activity')) {
      userMessage = 'ElevenLabs free tier is restricted on this account. Please upgrade to a paid ElevenLabs plan to use voice preview.';
    } else if (raw.includes('401') || raw.toLowerCase().includes('invalid_api_key') || raw.toLowerCase().includes('unauthorized')) {
      userMessage = 'ElevenLabs API key is invalid — check ELEVENLABS_API_KEY in your .env file.';
    } else if (raw.includes('429')) {
      userMessage = 'ElevenLabs rate limit reached — try again in a moment.';
    } else if (raw.includes('422')) {
      userMessage = 'This voice is not available on your ElevenLabs plan.';
    }

    res.status(400).json({ error: userMessage });
  }
};
