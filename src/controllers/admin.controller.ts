import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import { env } from '../config/env.js';
import * as elevenlabs from '../services/elevenlabs.service.js';
import * as emailService from '../services/email.service.js';
import twilio from 'twilio';

// ─── Stats ────────────────────────────────────────────────────────────────────
export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [total, active, suspended, newThisMonth, onboardingDone] = await Promise.all([
    prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
    prisma.user.count({ where: { role: { not: 'ADMIN' }, status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count({ where: { role: { not: 'ADMIN' }, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.business.count({ where: { onboardingDone: true } }),
  ]);

  res.json({ total, active, suspended, newThisMonth, onboardingDone });
});

// ─── List Users ───────────────────────────────────────────────────────────────
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const search = (req.query.search as string) || '';
  const skip = (page - 1) * limit;

  const where: any = {
    role: { not: 'ADMIN' },
    ...(search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { business: { name: { contains: search, mode: 'insensitive' } } },
      ],
    } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        business: {
          select: {
            id: true,
            name: true,
            type: true,
            country: true,
            onboardingDone: true,
            agent: { select: { elevenlabsAgentId: true, isActive: true } },
            subscription: { select: { plan: true, status: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, pages: Math.ceil(total / limit) });
});

// ─── Delete User ──────────────────────────────────────────────────────────────
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { business: { include: { agent: true } } },
  });
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'ADMIN') throw ApiError.forbidden('Cannot delete admin accounts');

  // Delete ElevenLabs agent first (best-effort)
  const agentId = user.business?.agent?.elevenlabsAgentId;
  if (agentId) {
    try {
      await elevenlabs.deleteAgent(agentId);
      console.log(`[Admin] Deleted ElevenLabs agent ${agentId} for user ${id}`);
    } catch (e: any) {
      console.error(`[Admin] Failed to delete ElevenLabs agent ${agentId}:`, e.message);
    }
  }

  // Cascade delete via Prisma (schema has onDelete: Cascade on all relations)
  await prisma.user.delete({ where: { id } });

  res.json({ success: true, message: 'User and all associated data deleted.' });
});

// ─── Suspend User ─────────────────────────────────────────────────────────────
export const suspendUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { business: true },
  });
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'ADMIN') throw ApiError.forbidden('Cannot suspend admin accounts');
  if (user.status === 'SUSPENDED') {
    res.json({ success: true, message: 'Account is already suspended.' });
    return;
  }

  await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });

  // Send suspension email to the business email (or user email as fallback)
  const emailTo = user.business?.email || user.email;
  const businessName = user.business?.name || `${user.firstName} ${user.lastName}`;
  if (emailTo) {
    emailService.sendAccountSuspendedEmail(emailTo, businessName)
      .catch(e => console.error('[Admin] Suspension email failed:', e.message));
  }

  res.json({ success: true, message: 'Account suspended and notification sent.' });
});

// ─── Unsuspend User ───────────────────────────────────────────────────────────
export const unsuspendUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { business: true },
  });
  if (!user) throw ApiError.notFound('User not found');
  if (user.status === 'ACTIVE') {
    res.json({ success: true, message: 'Account is already active.' });
    return;
  }

  await prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } });

  const emailTo = user.business?.email || user.email;
  const businessName = user.business?.name || `${user.firstName} ${user.lastName}`;
  if (emailTo) {
    emailService.sendAccountReinstatedEmail(emailTo, businessName)
      .catch(e => console.error('[Admin] Reinstatement email failed:', e.message));
  }

  res.json({ success: true, message: 'Account reinstated and notification sent.' });
});

// ─── Integration / Credits Stats ─────────────────────────────────────────────
export const getIntegrationStats = asyncHandler(async (_req: Request, res: Response) => {
  const results: Record<string, any> = {};

  // ── ElevenLabs — subscription + agent count ──
  await (async () => {
    if (!env.ELEVENLABS_API_KEY) {
      results.elevenlabs = { status: 'not_configured' };
      return;
    }
    try {
      const elHeaders = {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Authorization': `Bearer ${env.ELEVENLABS_API_KEY}`,
      };

      const [subRes, agentsRes] = await Promise.all([
        fetch('https://api.elevenlabs.io/v1/user', { headers: elHeaders }),
        fetch('https://api.elevenlabs.io/v1/convai/agents?page_size=100', { headers: elHeaders }),
      ]);

      // Agents are required — if that fails the key is genuinely broken
      if (!agentsRes.ok) {
        results.elevenlabs = { status: 'error', message: `API returned ${agentsRes.status}` };
        return;
      }

      const agentsData = await agentsRes.json() as any;
      const agents: any[] = agentsData?.agents ?? [];
      const totalAgents: number = agentsData.total_count ?? agents.length;
      const agentList = agents.map((a: any) => ({
        name: a.name ?? 'Unnamed agent',
        agentId: a.agent_id,
      }));

      // Subscription data is best-effort — key may not have user-level access
      let sub: any = null;
      if (subRes.ok) {
        const userData = await subRes.json() as any;
        sub = userData.subscription ?? userData;
      }

      const usedPct = sub?.character_limit > 0
        ? Math.round((sub.character_count / sub.character_limit) * 100)
        : null;

      results.elevenlabs = {
        status: 'connected',
        tier: sub?.tier ?? null,
        characterCount: sub?.character_count ?? null,
        characterLimit: sub?.character_limit ?? null,
        remainingCharacters: sub ? sub.character_limit - sub.character_count : null,
        usedPercent: usedPct,
        voiceCount: sub?.voice_count ?? null,
        voiceLimit: sub?.voice_limit ?? null,
        nextResetDate: sub?.next_character_count_reset_unix
          ? new Date(sub.next_character_count_reset_unix * 1000).toISOString()
          : null,
        activeAgents: totalAgents,
        agentList,
      };
    } catch (e: any) {
      results.elevenlabs = { status: 'error', message: e.message };
    }
  })();

  // ── Twilio — balance, provisioned numbers, usage ──
  await (async () => {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      results.twilio = { status: 'not_configured' };
      return;
    }
    try {
      const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      const [balanceData, usageRecords, phoneNumbers, totalCalls] = await Promise.all([
        twilioClient.balance.fetch(),
        twilioClient.usage.records.thisMonth.list({ limit: 100 }),
        twilioClient.incomingPhoneNumbers.list(),
        prisma.call.count(),
      ]);

      const find = (cat: string) => usageRecords.find((r: any) => r.category === cat);
      const price = (rec: any) => rec ? Math.abs(parseFloat(String(rec.price))).toFixed(4) : '0.0000';
      const usage = (rec: any) => rec ? parseFloat(String(rec.usage)).toFixed(1) : '0.0';
      const count = (rec: any) => rec ? parseInt(String(rec.count), 10) : 0;

      // Usage categories
      const callsRec       = find('calls');
      const callsInRec     = find('calls-inbound');
      const smsRec         = find('sms');
      const numbersRec     = find('phonenumbers') ?? find('phonenumbers-local');

      // Month-to-date total spend across all categories
      const totalSpend = usageRecords.reduce((sum: number, r: any) => {
        const p = parseFloat(String(r.price));
        return sum + (isNaN(p) ? 0 : Math.abs(p));
      }, 0);

      results.twilio = {
        status: 'connected',
        balance: parseFloat(balanceData.balance).toFixed(2),
        currency: balanceData.currency,
        // Provisioned numbers
        activeNumbers: phoneNumbers.length,
        activeNumbersList: phoneNumbers.map((n: any) => ({
          friendlyName: n.friendlyName,
          phoneNumber: n.phoneNumber,
        })),
        numberRentalCost: price(numbersRec),
        // Calls
        thisMonthCallMinutes: usage(callsRec),
        thisMonthInboundCallMinutes: usage(callsInRec),
        thisMonthCallCost: price(callsRec),
        // SMS
        thisMonthSmsCount: count(smsRec),
        thisMonthSmsCost: price(smsRec),
        // Totals
        thisMonthTotalSpend: totalSpend.toFixed(2),
        totalCallsHandled: totalCalls,
      };
    } catch (e: any) {
      results.twilio = { status: 'error', message: e.message };
    }
  })();

  // ── Stripe — customers, subscriptions, total revenue ──
  await (async () => {
    if (!env.STRIPE_SECRET_KEY) {
      results.stripe = { status: 'not_configured' };
      return;
    }
    try {
      const Stripe = (await import('stripe')).default;
      const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' as any });

      const [customers, activeSubs, trialSubs, invoices] = await Promise.all([
        stripeClient.customers.list({ limit: 1 }) as any,
        stripeClient.subscriptions.list({ status: 'active', limit: 1 }) as any,
        stripeClient.subscriptions.list({ status: 'trialing', limit: 1 }) as any,
        stripeClient.invoices.list({ status: 'paid', limit: 100 }),
      ]);

      const totalRevenueCents = invoices.data.reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0);

      results.stripe = {
        status: 'connected',
        totalCustomers: customers.total_count ?? customers.data?.length ?? 0,
        activeSubscriptions: activeSubs.total_count ?? activeSubs.data?.length ?? 0,
        trialSubscriptions: trialSubs.total_count ?? trialSubs.data?.length ?? 0,
        totalRevenue: (totalRevenueCents / 100).toFixed(2),
        currency: invoices.data[0]?.currency?.toUpperCase() ?? 'GBP',
      };
    } catch (e: any) {
      results.stripe = { status: 'error', message: e.message };
    }
  })();

  // ── Anthropic — usage report (requires Admin API key) ──
  await (async () => {
    const totalExtractions = await prisma.businessExtraction.count();
    if (!env.ANTHROPIC_ADMIN_KEY) {
      results.anthropic = {
        status: env.ANTHROPIC_API_KEY ? 'connected' : 'not_configured',
        note: 'Add ANTHROPIC_ADMIN_KEY to .env for live token usage and cost data.',
        totalExtractions,
      };
      return;
    }
    try {
      // Last 30 days usage report
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const usageRes = await fetch(
        `https://api.anthropic.com/v1/organizations/usage?start_date=${startDate}&bucket_width=1d`,
        {
          headers: {
            'x-api-key': env.ANTHROPIC_ADMIN_KEY,
            'anthropic-version': '2023-06-01',
          },
        }
      );

      if (!usageRes.ok) {
        results.anthropic = {
          status: 'error',
          message: `Admin API returned ${usageRes.status}`,
          totalExtractions,
        };
        return;
      }

      const usageData = await usageRes.json() as any;
      const buckets: any[] = usageData.data ?? usageData.usage_data ?? [];
      const totals = buckets.reduce(
        (acc, b) => ({
          inputTokens: acc.inputTokens + (b.input_tokens ?? b.uncached_input_tokens ?? 0),
          outputTokens: acc.outputTokens + (b.output_tokens ?? 0),
          cacheTokens: acc.cacheTokens + (b.cache_creation_input_tokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0, cacheTokens: 0 }
      );

      results.anthropic = {
        status: 'connected',
        last30DaysInputTokens: totals.inputTokens,
        last30DaysOutputTokens: totals.outputTokens,
        last30DaysCacheTokens: totals.cacheTokens,
        totalExtractions,
      };
    } catch (e: any) {
      results.anthropic = { status: 'error', message: e.message, totalExtractions };
    }
  })();

  // ── Google Places — no usage API with API key ──
  results.googlePlaces = {
    status: env.GOOGLE_PLACES_API ? 'connected' : 'not_configured',
    note: 'Usage data not available via API key. Check Google Cloud Console for quota usage.',
    usedFor: 'Business search (onboarding) and delivery address geocoding.',
  };

  // ── Resend — no stats API ──
  results.resend = {
    status: env.RESEND_API_KEY ? 'connected' : 'not_configured',
    note: 'No usage API available. Check resend.com dashboard for delivery stats.',
    usedFor: 'All transactional emails (orders, reservations, auth, notifications).',
  };

  res.json(results);
});
