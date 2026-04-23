import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as elevenlabs from '../services/elevenlabs.service.js';
import * as posService from '../services/pos.service.js';
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
  // Push new voice to ElevenLabs immediately
  if (agent.elevenlabsAgentId && req.body.voiceId) {
    elevenlabs.updateAgent(agent.elevenlabsAgentId, {
      conversation_config: { tts: { voice_id: req.body.voiceId } },
    }).catch(e => console.error('[AutoSync] voice update failed:', e.message));
  }
  // Rebuild system prompt (greeting etc. may reference agent settings)
  autoSyncAgent(businessId).catch(e => console.error('[AutoSync] failed:', e.message));
  res.json(agent);
});

export const updateScript = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const agent = await prisma.agent.update({
    where: { businessId },
    data: req.body,
  });
  // Sync greeting + system prompt to ElevenLabs
  autoSyncAgent(businessId).catch(e => console.error('[AutoSync] failed:', e.message));
  res.json(agent);
});

export const updateCallRules = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const agent = await prisma.agent.update({
    where: { businessId },
    data: req.body,
  });
  // Sync transfer/call rule changes to ElevenLabs system prompt
  autoSyncAgent(businessId).catch(e => console.error('[AutoSync] failed:', e.message));
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
  const [business, agent, dbMenuCategories, faqs, orderingPolicy, reservationPolicy, orderingIntegration] = await Promise.all([
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
    prisma.integration.findFirst({ where: { businessId, name: { in: ['Square', 'Clover', 'Zettle'] }, status: 'CONNECTED' } }),
  ]);

  if (!business || !agent?.elevenlabsAgentId) {
    throw new Error('Agent not configured');
  }

  // Fetch live integration menu (Square/Clover) to pass alongside DB menu
  let integrationMenuData: import('../services/pos.service.js').IntegrationMenuResult | null = null;
  if (orderingIntegration?.config) {
    try {
      const cfg = orderingIntegration.config as Record<string, string>;
      if (orderingIntegration.name === 'Square') {
        integrationMenuData = await posService.fetchLiveMenuFromSquare({ accessToken: cfg.accessToken, locationId: cfg.locationId });
      } else if (orderingIntegration.name === 'Clover') {
        integrationMenuData = await posService.fetchLiveMenuFromClover({ accessToken: cfg.accessToken, merchantId: cfg.merchantId });
      } else if (orderingIntegration.name === 'Zettle') {
        integrationMenuData = await posService.fetchLiveMenuFromZettle({ accessToken: cfg.accessToken });
      }
    } catch (err: any) {
      console.error('[AutoSync] Integration menu fetch failed (non-fatal):', err.message);
    }
  }

  // buildSystemPrompt handles de-duplication — DB items always win on name clash
  const systemPrompt = elevenlabs.buildSystemPrompt({
    name: business.name,
    type: business.type,
    address: business.address,
    openingHours: business.openingHours,
    agentName: agent.name,
    greeting: agent.openingGreeting,
    currency: (business as any).currency,
    menuCategories: dbMenuCategories,
    faqs,
    orderingPolicy,
    reservationPolicy,
    agent: {
      transferEnabled: agent.transferEnabled,
      transferNumber: agent.transferNumber ?? undefined,
      openingGreeting: agent.openingGreeting,
    },
  }, integrationMenuData);

  const tools = elevenlabs.buildAgentTools({
    businessId,
    transferEnabled: agent.transferEnabled,
    transferNumber: agent.transferNumber ?? undefined,
  });

  // Push to ElevenLabs — update system prompt, first message, and tools together
  await elevenlabs.updateAgent(agent.elevenlabsAgentId, {
    conversation_config: {
      agent: {
        prompt: { prompt: systemPrompt },
        ...(agent.openingGreeting ? { first_message: agent.openingGreeting } : {}),
      },
    },
    tools,
  });

  // Save in DB so we have a record
  await prisma.agent.update({ where: { businessId }, data: { systemPrompt } });

  return dbMenuCategories.reduce((n: number, c: any) => n + c.items.length, 0);
};

// ─── Sync Calls from ElevenLabs ──────────────────────────────────────────────
// Fetches all conversations for this business's agent from ElevenLabs and
// upserts any that are missing from our database (happens when post-call webhook
// isn't configured or missed a delivery).
export const syncCalls = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const agent = await prisma.agent.findUnique({ where: { businessId } });
  if (!agent?.elevenlabsAgentId) throw ApiError.badRequest('Agent not configured');

  const result = await syncCallsForAgent(agent.elevenlabsAgentId, businessId);
  res.json(result);
});

// ─── Internal helper — can be called without an HTTP request ─────────────────
export const syncCallsForAgent = async (agentId: string, businessId: string) => {
  const conversations = await elevenlabs.listConversations(agentId);

  let imported = 0;
  let updated = 0;

  for (const conv of conversations) {
    const convId: string = conv.conversation_id;
    if (!convId) continue;

    // Fetch full details (includes transcript + phone metadata)
    const full = await elevenlabs.getConversation(convId);
    const meta = full.metadata || {};
    const phoneCall = meta.phone_call || {};

    const callerPhone: string | null = phoneCall.external_number || null;
    const durationSecs: number | null = meta.call_duration_secs != null
      ? Math.round(meta.call_duration_secs) : null;
    const startedAt = meta.start_time_unix_secs
      ? new Date(meta.start_time_unix_secs * 1000) : null;
    const callStatus = full.status === 'done' ? 'COMPLETED' : full.status === 'processing' ? 'LIVE' : 'COMPLETED';

    // Format transcript
    const rawTranscript: any[] = full.transcript || [];
    const transcript = rawTranscript.length > 0
      ? rawTranscript.map((t: any) => `${t.role === 'agent' ? 'Agent' : 'Caller'}: ${t.message || t.text || ''}`).filter(Boolean).join('\n')
      : null;

    const existing = await prisma.call.findFirst({ where: { elevenlabsConvId: convId } });

    if (existing) {
      // Update if transcript is missing or status is still LIVE
      if (!existing.transcript || existing.status === 'LIVE') {
        await prisma.call.update({
          where: { id: existing.id },
          data: {
            status: callStatus as any,
            duration: durationSecs ?? existing.duration,
            transcript: transcript ?? existing.transcript,
            callerPhone: callerPhone || existing.callerPhone,
            endedAt: existing.endedAt || (callStatus === 'COMPLETED' ? new Date() : null),
            ...(startedAt && !existing.startedAt ? { startedAt } : {}),
          },
        });
        updated++;
      }
    } else {
      // Create new record
      await prisma.call.create({
        data: {
          businessId,
          elevenlabsConvId: convId,
          callerPhone,
          status: callStatus as any,
          duration: durationSecs,
          transcript,
          startedAt: startedAt || new Date(),
          endedAt: callStatus === 'COMPLETED' ? new Date() : null,
        },
      });
      imported++;
    }
  }

  return { synced: conversations.length, imported, updated };
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
