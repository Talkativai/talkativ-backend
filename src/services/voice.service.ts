import { env } from '../config/env.js';

// ─── Provider: Ultravox (conversational AI for phone calls) ──────────────────
// ─── Provider: Cartesia (TTS for voice previews) ─────────────────────────────

const ULTRAVOX_BASE_URL = 'https://api.ultravox.ai/api';
const CARTESIA_BASE_URL = 'https://api.cartesia.ai';
const CARTESIA_VERSION = '2024-06-10';

const ultravoxHeaders = () => ({
  'X-API-Key': env.ULTRAVOX_API_KEY,
  'Content-Type': 'application/json',
});

const cartesiaHeaders = () => ({
  'X-API-Key': env.CARTESIA_API_KEY,
  'Cartesia-Version': CARTESIA_VERSION,
  'Content-Type': 'application/json',
});

// ─── Agent Tools Builder (Ultravox selectedTools format) ─────────────────────

export const buildAgentTools = (config: {
  businessId: string;
  transferEnabled?: boolean;
  transferNumber?: string;
}): any[] => {
  const biz = `Always send EXACTLY this value: ${config.businessId}`;

  const makeHttpTool = (
    name: string,
    description: string,
    url: string,
    params: [string, any][],
    required: string[],
  ) => ({
    temporaryTool: {
      modelToolName: name,
      description,
      dynamicParameters: params.map(([paramName, schema]) => ({
        name: paramName,
        location: 'PARAMETER_LOCATION_BODY',
        schema,
        required: required.includes(paramName),
      })),
      http: { baseUrlPattern: url, httpMethod: 'POST' },
    },
  });

  const tools: any[] = [
    makeHttpTool(
      'lookup_catalogue',
      'Look up menu items by name or category. Use this to confirm prices or availability before creating an order.',
      `${env.BACKEND_URL}/webhooks/public/catalogue-lookup`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['query', { type: 'string', description: 'Menu item name or category to search' }],
      ],
      ['business_id', 'query'],
    ),
    makeHttpTool(
      'validate_delivery_address',
      "Validate a customer's postcode to check it falls within the delivery radius. MUST be called before creating a DELIVERY order.",
      `${env.BACKEND_URL}/webhooks/public/check-delivery`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['customer_postal_code', { type: 'string', description: 'Postcode provided by the customer' }],
      ],
      ['business_id', 'customer_postal_code'],
    ),
    makeHttpTool(
      'create_order',
      'Place a food order. For DELIVERY, ensure you have validated the address first.',
      `${env.BACKEND_URL}/webhooks/public/create-order`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['conversation_id', { type: 'string', description: "Always send EXACTLY the current conversation_id so the backend can auto-detect the caller's phone number" }],
        ['customer_name', { type: 'string', description: 'Full name' }],
        ['delivery_address', { type: 'string', description: 'Formatted, validated delivery address if type is DELIVERY' }],
        ['items', { type: 'string', description: 'Comma separated list of ordered items exactly as listed in the menu' }],
        ['type', { type: 'string', enum: ['DELIVERY', 'COLLECTION'] }],
        ['allergies', { type: 'string', description: 'Any food allergies or dietary requirements specifically stated by the caller' }],
        ['payment_method', { type: 'string', enum: ['pay_now', 'pay_on_delivery', 'pay_on_collection'] }],
        ['notes', { type: 'string', description: 'Special instructions or notes for the kitchen' }],
      ],
      ['business_id', 'conversation_id', 'customer_name', 'items', 'type', 'payment_method'],
    ),
    makeHttpTool(
      'check_availability',
      'Check if a table is available for a given date, time, and party size. ALWAYS call this before creating a reservation.',
      `${env.BACKEND_URL}/webhooks/public/check-availability`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['date', { type: 'string', description: 'Date in YYYY-MM-DD format' }],
        ['time', { type: 'string', description: 'Time in HH:MM 24-hour format' }],
        ['guests', { type: 'number', description: 'Number of guests' }],
      ],
      ['business_id', 'date', 'time', 'guests'],
    ),
    makeHttpTool(
      'create_reservation',
      'Book a table reservation. Only call after check_availability confirms the slot is available.',
      `${env.BACKEND_URL}/webhooks/public/create-reservation`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['conversation_id', { type: 'string', description: "Always send EXACTLY the current conversation_id so the backend can auto-detect the caller's phone number" }],
        ['guest_name', { type: 'string' }],
        ['guests', { type: 'number', description: 'Number of guests attending' }],
        ['date_time', { type: 'string', description: 'ISO 8601 date-time string for the reservation' }],
      ],
      ['business_id', 'conversation_id', 'guest_name', 'guests', 'date_time'],
    ),
    makeHttpTool(
      'get_reservation',
      'Look up an existing reservation by Talkativ reference (TLK-XXXX) or phone number. Use this before cancelling or updating.',
      `${env.BACKEND_URL}/webhooks/public/get-reservation`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['conversation_id', { type: 'string', description: "Always send EXACTLY the current conversation_id so the backend can auto-detect the caller's phone number" }],
        ['talkativ_ref', { type: 'string', description: 'Talkativ booking reference e.g. TLK-4A2F (preferred lookup key)' }],
      ],
      ['business_id', 'conversation_id'],
    ),
    makeHttpTool(
      'cancel_reservation',
      'Cancel an existing reservation. Always call get_reservation first to confirm details and inform the customer of the refund/cancellation policy.',
      `${env.BACKEND_URL}/webhooks/public/cancel-reservation`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['conversation_id', { type: 'string', description: "Always send EXACTLY the current conversation_id so the backend can auto-detect the caller's phone number" }],
        ['talkativ_ref', { type: 'string', description: 'Talkativ booking reference e.g. TLK-4A2F (preferred lookup key)' }],
      ],
      ['business_id', 'conversation_id'],
    ),
    makeHttpTool(
      'update_reservation',
      'Update an existing reservation (party size or date/time). If the new slot is unavailable, the response will include alternative slots — present them to the customer.',
      `${env.BACKEND_URL}/webhooks/public/update-reservation`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['conversation_id', { type: 'string', description: "Always send EXACTLY the current conversation_id so the backend can auto-detect the caller's phone number" }],
        ['talkativ_ref', { type: 'string', description: 'Talkativ booking reference e.g. TLK-4A2F (preferred lookup key)' }],
        ['new_date_time', { type: 'string', description: 'New date/time as ISO 8601 string (omit if only changing guests)' }],
        ['new_guests', { type: 'number', description: 'New party size (omit if only changing date/time)' }],
      ],
      ['business_id', 'conversation_id'],
    ),
    makeHttpTool(
      'confirm_payment',
      'Check if the customer has completed payment for their order. Call this ONLY after the customer tells you they have paid. Do NOT call proactively.',
      `${env.BACKEND_URL}/webhooks/public/confirm-payment`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['order_id', { type: 'string', description: 'The order_id returned by create_order' }],
      ],
      ['business_id', 'order_id'],
    ),
    makeHttpTool(
      'get_upsell_suggestions',
      'Get contextual upsell suggestions based on what the customer has already ordered. Call this after the customer has chosen their main items but before finalising. Naturally weave suggestions into conversation — never push hard.',
      `${env.BACKEND_URL}/webhooks/public/upsell-suggestions`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['ordered_items', { type: 'string', description: 'Comma-separated list of items already chosen by the customer' }],
        ['order_type', { type: 'string', enum: ['DELIVERY', 'COLLECTION'], description: 'Whether this is delivery or collection' }],
        ['party_size', { type: 'number', description: 'Number of people ordering (default 1 if unknown)' }],
      ],
      ['business_id', 'ordered_items'],
    ),
    makeHttpTool(
      'check_caller_history',
      "Check if this caller has ordered or booked with us before. Call this at the very start of any ordering or reservation call to personalise the interaction. If they're a returning customer, greet them by name and reference their last visit.",
      `${env.BACKEND_URL}/webhooks/public/caller-history`,
      [
        ['business_id', { type: 'string', description: biz }],
        ['conversation_id', { type: 'string', description: "Always send EXACTLY the current conversation_id so the backend can auto-detect the caller's phone number" }],
      ],
      ['business_id', 'conversation_id'],
    ),
    makeHttpTool(
      'check_hours',
      "Check the restaurant's exact opening and closing hours for each day.",
      `${env.BACKEND_URL}/webhooks/public/check-hours`,
      [
        ['business_id', { type: 'string', description: biz }],
      ],
      ['business_id'],
    ),
  ];

  if (config.transferEnabled && config.transferNumber) {
    tools.push(
      makeHttpTool(
        'notify_transfer',
        'MUST be called BEFORE transfer_call. Alerts the business owner by SMS that a caller is being transferred. Always call this first, then immediately call transfer_call.',
        `${env.BACKEND_URL}/webhooks/public/notify-transfer`,
        [
          ['business_id', { type: 'string', description: biz }],
          ['conversation_id', { type: 'string', description: 'Always send EXACTLY the current conversation_id' }],
          ['reason', { type: 'string', description: 'Brief reason for the transfer e.g. "customer requested human" or "customer unhappy about order"' }],
        ],
        ['business_id', 'conversation_id', 'reason'],
      ),
    );
    // Transfer call via backend webhook (Ultravox does not have a built-in transfer_call system tool)
    tools.push(
      makeHttpTool(
        'transfer_call',
        'Transfer the call to a human. ALWAYS call notify_transfer first before calling this.',
        `${env.BACKEND_URL}/webhooks/public/transfer-call`,
        [
          ['business_id', { type: 'string', description: biz }],
          ['conversation_id', { type: 'string', description: 'Always send EXACTLY the current conversation_id' }],
          ['transfer_to', { type: 'string', description: `The phone number to transfer to — always send EXACTLY: ${config.transferNumber}` }],
        ],
        ['business_id', 'conversation_id', 'transfer_to'],
      ),
    );
  }

  return tools;
};

// ─── Create Ultravox Call Session ─────────────────────────────────────────────
// Used for both phone calls (medium: twilio) and browser demo calls (medium: serverWebSocket).
// Returns the Ultravox joinUrl (WebSocket URL for Twilio/browser to connect to).
export const createCallSession = async (config: {
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  tools: any[];
  medium?: Record<string, any>;
  callEndedWebhookUrl?: string;
}): Promise<{ callId: string; joinUrl: string }> => {
  const body: Record<string, any> = {
    model: 'fixie-ai/ultravox',
    systemPrompt: config.systemPrompt,
    // Ultravox native voice ID — pass directly, no prefix needed.
    voice: config.voiceId,
    selectedTools: config.tools,
    firstSpeaker: 'FIRST_SPEAKER_AGENT',
    medium: config.medium || { twilio: {} },
      };

  if (config.firstMessage) {
    body.initialMessages = [{ role: 'MESSAGE_ROLE_AGENT', text: config.firstMessage }];
  }

  // if (config.callEndedWebhookUrl) {
  //   body.callEndedWebhookUrl = config.callEndedWebhookUrl;
  // }




  if (config.callEndedWebhookUrl) {
  body.callbacks = {
    ended: {
      url: config.callEndedWebhookUrl,
    },
  };
}




  const res = await fetch(`${ULTRAVOX_BASE_URL}/calls`, {
    method: 'POST',
    headers: ultravoxHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Ultravox createCallSession failed: ${error}`);
  }

  const data = await res.json() as { callId: string; joinUrl: string };
  return data;
};

// ─── Agent Lifecycle (compatibility shim for ElevenLabs-style agent management) ─

// With Ultravox there are no persistent agents — config is passed at call-creation time.
// createAgent stores a marker so controllers know the voice provider is configured.
export const createAgent = async (config: {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  language?: string;
  businessId: string;
  transferEnabled?: boolean;
  transferNumber?: string;
}): Promise<{ agent_id: string }> => {
  // No remote agent to create — return a stable pseudo-ID so the DB field gets populated.
  return { agent_id: `ultravox:${config.businessId}` };
};

// updateAgent is a no-op — Ultravox builds config fresh for every call.
export const updateAgent = async (_agentId: string, _updates: Record<string, any>): Promise<void> => {
  // Nothing to do — system prompt and tools are assembled at call time.
};

// ─── Phone Number Registration ───────────────────────────────────────────────
// With Ultravox the Twilio number just needs to point to our backend inbound webhook.
// Actual Twilio URL update is handled by twilio.service.ts connectNumberToAgent.
export const registerPhoneNumber = async (
  phoneNumber: string,
  _agentId: string,
): Promise<string | null> => {
  console.log('[Voice] registerPhoneNumber called for', phoneNumber, '— Ultravox uses backend inbound webhook (no registration needed)');
  return phoneNumber; // return phoneNumber as the "phoneNumberId" placeholder
};

export const deleteAgent = async (_agentId: string): Promise<boolean> => {
  // Ultravox has no persistent agent to delete.
  return true;
};

// ─── Conversation / Call Listing ──────────────────────────────────────────────
// Lists Ultravox calls for sync purposes.
export const listConversations = async (_agentId?: string, pageSize = 100): Promise<any[]> => {
  const res = await fetch(`${ULTRAVOX_BASE_URL}/calls?pageSize=${pageSize}`, {
    headers: ultravoxHeaders(),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Ultravox listCalls failed: ${error}`);
  }
  const data = await res.json() as any;
  // Normalise to the shape the caller expects (ElevenLabs-compatible)
  const results = data.results || data.calls || [];
  return results.map((c: any) => ({ conversation_id: c.callId, ...c }));
};

export const getConversation = async (conversationId: string): Promise<any> => {
  const res = await fetch(`${ULTRAVOX_BASE_URL}/calls/${conversationId}`, {
    headers: ultravoxHeaders(),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Ultravox getCall failed: ${error}`);
  }
  const data = await res.json() as any;

  // Normalise metadata shape to match what webhook.controller expects
  const phoneNumber = data.metadata?.callerPhoneNumber || null;
  return {
    ...data,
    metadata: {
      ...data.metadata,
      phone_call: {
        external_number: phoneNumber,
        caller_id: phoneNumber,
      },
      call_duration_secs: data.metadata?.durationSeconds ?? null,
      start_time_unix_secs: data.joined
        ? Math.floor(new Date(data.joined).getTime() / 1000)
        : null,
    },
    transcript: (data.transcript || []).map((t: any) => ({
      role: t.speaker === 'agent' ? 'agent' : 'user',
      message: t.text || t.message || '',
    })),
    status: data.endReason ? 'done' : 'processing',
  };
};

// ─── Text-to-Speech Preview (Cartesia) ───────────────────────────────────────
// Accepts a Cartesia voice ID (ttsId from the frontend voice catalogue),
// NOT the Ultravox voice ID used for actual calls.

export const textToSpeech = async (voiceId: string, text: string): Promise<Buffer> => {
  const res = await fetch(`${CARTESIA_BASE_URL}/tts/bytes`, {
    method: 'POST',
    headers: cartesiaHeaders(),
    body: JSON.stringify({
      transcript: text,
      model_id: 'sonic-2',
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'mp3', bit_rate: 128000, sample_rate: 44100 },
      language: 'en',
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Cartesia TTS failed [${res.status}]: ${error}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

// ─── Voices ───────────────────────────────────────────────────────────────────
// Returns the static Cartesia voice catalogue (no API call needed).
export const listVoices = async () => {
  const { AVAILABLE_VOICES } = await import('../utils/constants.js');
  return { voices: AVAILABLE_VOICES };
};

// ─── System Prompt Template ───────────────────────────────────────────────────
// Identical to the ElevenLabs version — no provider-specific content.

export const buildSystemPrompt = (
  business: any,
  integrationMenu?: {
    source: string;
    categories: { name: string; items: { name: string; description?: string; price: number }[] }[];
  } | null,
) => {
  // ── Hours ──────────────────────────────────────────────────────────────────
  const scheduleSource = business.openingHours;
  let hoursStr = 'Not specified';
  if (scheduleSource) {
    if (scheduleSource.is24h === 'true' || scheduleSource.is24h === true) {
      hoursStr = 'Open 24 hours, 7 days a week';
    } else {
      const lines = Object.entries(scheduleSource)
        .filter(([day]) => day !== 'is24h')
        .map(([day, val]: [string, any]) => {
          const v = typeof val === 'string' ? val : '';
          if (!v || v === 'closed') return `${day}: Closed`;
          const [open, close] = v.split('-');
          return `${day}: ${open || v} - ${close || ''}`.trim();
        });
      hoursStr = lines.length > 0 ? lines.join('\n') : 'Not specified';
    }
  }

  // ── Menu (DB + integration, de-duplicated — DB wins on name clash) ────────
  const dbCategories: any[] = business.menuCategories || [];
  const mergedMap = new Map<string, { name: string; description?: string; price: number; source: 'db' | 'integration' }[]>();

  for (const cat of dbCategories) {
    if (!cat.items || cat.items.length === 0) continue;
    const existing = mergedMap.get(cat.name) || [];
    for (const item of cat.items) {
      if (item.status && item.status !== 'ACTIVE') continue;
      existing.push({ name: item.name, description: item.description, price: Number(item.price), source: 'db' });
    }
    mergedMap.set(cat.name, existing);
  }

  if (integrationMenu?.categories) {
    for (const intCat of integrationMenu.categories) {
      const catKey = [...mergedMap.keys()].find(k => k.toLowerCase() === intCat.name.toLowerCase()) || intCat.name;
      const existing = mergedMap.get(catKey) || [];
      const dbNames = new Set(existing.map(i => i.name.toLowerCase()));
      for (const item of intCat.items) {
        if (dbNames.has(item.name.toLowerCase())) continue;
        existing.push({ name: item.name, description: item.description, price: item.price, source: 'integration' });
      }
      mergedMap.set(catKey, existing);
    }
  }

  let menuSection = '';
  if (mergedMap.size > 0) {
    const lines: string[] = [
      `CURRENT MENU (100% accurate — this is everything we serve${integrationMenu ? ` — includes live data from ${integrationMenu.source}` : ''}):`,
    ];
    for (const [catName, items] of mergedMap) {
      if (items.length === 0) continue;
      lines.push(`\n[${catName}]`);
      for (const item of items) {
        const currency = business.currency || 'GBP';
        const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
        const price = item.price ? ` — ${symbol}${item.price.toFixed(2)}` : '';
        const desc = item.description ? ` (${item.description})` : '';
        lines.push(`  • ${item.name}${price}${desc}`);
      }
    }
    menuSection = lines.join('\n');
  } else {
    menuSection = 'MENU: Not yet loaded. Use the lookup_catalogue tool to find items.';
  }

  // ── Ordering policy ────────────────────────────────────────────────────────
  const orderPol = business.orderingPolicy;
  const orderRules = orderPol
    ? `
  - Delivery: ${orderPol.deliveryEnabled ? `Enabled. Fee: £${orderPol.deliveryFee}. Radius: ${orderPol.deliveryRadius} ${orderPol.deliveryRadiusUnit}` : 'Disabled'}
  - Collection: ${orderPol.collectionEnabled ? 'Enabled' : 'Disabled'}
  - Min Order Amount: £${orderPol.minOrderAmount}
  - Payment Methods Allowed: ${orderPol.deliveryPayOnDelivery || orderPol.payOnDelivery ? 'Pay on Delivery, ' : ''}${orderPol.collectionPayOnPickup ? 'Pay on Collection, ' : ''}${(orderPol.payNowEnabled || orderPol.deliveryPayNow || orderPol.collectionPayNow) ? 'Pay Now' : ''}
  `
    : '- Ordering is NOT available. Do not accept any food orders — politely inform the caller that ordering is not currently offered.';

  // ── Reservation policy ─────────────────────────────────────────────────────
  const resPol = business.reservationPolicy;
  const resRules = resPol?.reservationsEnabled
    ? `
  - Reservations Enabled: Yes
  - Max Party Size: ${resPol.maxPartySize} guests
  - Booking Lead Time: ${resPol.bookingLeadTime} hours
  - Deposit Required: ${resPol.depositRequired ? `Yes. Amount: £${resPol.depositAmount} (${resPol.depositType})` : 'No'}
  `
    : '- Reservations are NOT available. Do not accept any table bookings — politely inform the caller that reservations are not currently offered.';

  // ── FAQs ───────────────────────────────────────────────────────────────────
  const faqs = (business.faqs || []).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

  return `You are ${business.agentName}, the AI phone assistant for ${business.name}.
Business type: ${business.type || 'Restaurant'}
Location: ${business.address || 'Not specified'}
Opening hours:
${hoursStr}

SPEAKING STYLE: Speak at a calm, measured pace — not too fast. When reading out menu items or lists, pause briefly between each item so the customer can follow along easily. Sound warm and human — never robotic.

---
${menuSection}

---
BUSINESS POLICIES:

📋 Ordering:
${orderRules}

🗓️ Reservations:
${resRules}

${faqs ? `❓ FAQs:\n${faqs}\n\n---` : ''}
YOUR TOOLS:
🛒 Ordering:
- check_caller_history — check if this is a returning customer (call at the START of ordering/reservation calls)
- lookup_catalogue — confirm a specific item is available/in stock before placing an order
- validate_delivery_address — validate the customer's postcode for delivery eligibility (MUST call before create_order for DELIVERY)
- create_order — place a food order (DELIVERY or COLLECTION)
- get_upsell_suggestions — get contextual add-on suggestions after the customer has chosen their main items
- confirm_payment — verify the customer has paid (call ONLY after customer says they've paid)

🗓️ Reservations:
- check_caller_history — check if this is a returning customer (call at the START of ordering/reservation calls)
- check_availability — check if a table is available for a date, time, and party size (ALWAYS call before create_reservation)
- create_reservation — book a table (only after check_availability confirms the slot is free)
- get_reservation — look up an existing reservation by TLK reference or phone number (ALWAYS call before cancel or update)
- cancel_reservation — cancel an existing reservation
- update_reservation — update an existing reservation (date/time or party size)

🕐 General:
- check_hours — get the restaurant's opening hours for any day
${business.agent?.transferEnabled ? '- notify_transfer — alert the business owner by SMS before transferring (ALWAYS call this first)\n- transfer_call — transfer the call to a human manager (ALWAYS call notify_transfer before this)' : ''}

RULES (follow every single one, no exceptions):

1. ❌ NEVER INVENT MENU ITEMS — This is the most important rule. The CURRENT MENU section above is the ONLY food and drink we have. If a customer asks for ANYTHING not listed there (e.g. "margherita pizza", "burger", "pasta", etc.), you MUST say "I'm sorry, we don't have that on our menu" and offer to tell them what we DO have. Never say "let me check" for items obviously not on the menu — just say we don't have it.

2. ✅ CONFIRM BEFORE ORDERING — Before finalising any order, call lookup_catalogue to confirm the exact item is currently active. If it comes back empty, say "I'm sorry, that item isn't available right now."

3. 🚚 DELIVERY VALIDATION — For any delivery order, follow these steps exactly:
   a. Ask: "Could you give me your postcode please?"
   b. Call validate_delivery_address with the postcode exactly as the customer says it.
   c. If not_found is true — say "I'm sorry, I didn't quite catch that postcode, could you repeat it?" and try once more. If it fails a second time, apologise and say you're unable to process the delivery.
   d. If eligible is true — say "Perfect, so that's [formatted_address from the tool response], is that correct?" ONLY use the formatted_address returned by the tool. NEVER make up or guess an address yourself.
   e. If eligible is false (and not_found is false) — read out the message from the response verbatim, then offer collection as an alternative if it is available.
   ⛔ CRITICAL: If formatted_address is absent from the tool response, DO NOT invent one. Ask the customer to repeat their postcode.

4. 🤧 ALLERGY CHECK — Always ask "Do you have any food allergies or dietary requirements?" before finalising any order.

5. 👤 MANAGER TRANSFER — ${business.agent?.transferEnabled ? 'If the customer asks to speak to a real person or manager, or is very frustrated, immediately call transfer_call.' : 'No transfer available. Politely explain and offer to take a message.'}

6. 💳 PAYMENTS — Confirm payment method from what the Ordering Rules allow. The customer's phone number is captured automatically from the call — do NOT ask for it. Never ask for an email address.
   After calling create_order:
   - If payment_link_sent is true → say "I've sent a payment link to your phone by text message. Please complete the payment and let me know once you're done."
   - Then WAIT for the customer to say they've paid (e.g. "done", "I've paid", "yes").
   - Once they confirm → call confirm_payment with the order_id.
   - If confirm_payment returns confirmed: true → say "Payment confirmed! Your order is all set." End the call warmly.
   - If confirm_payment returns confirmed: false → say "I'm sorry, I can't see the payment yet. Please check the link and try again, then let me know."
   - If payment_link_sent is false or absent → say "Your order is confirmed, you can pay on delivery/collection." Do NOT call confirm_payment.
   - If create_order returns error about no payment integration → tell the customer "I'm sorry, we're not set up to take phone orders right now." Do NOT attempt to place the order.

7. 🔡 DATA CLARITY — If a name or phone number is unclear, ask the customer to repeat it. For phone numbers, read it back to confirm before proceeding.

7b. 👤 RETURNING CUSTOMER — At the very start of any ordering or reservation call, call check_caller_history.
   - If it returns a returning customer: greet them by name ("Welcome back, [name]!") and optionally reference their last order/visit naturally.
   - If it returns a new caller or no history: continue normally without mentioning it.
   - NEVER ask the customer for their phone number — it is captured automatically.

7c. 🛍️ UPSELLING — After the customer has chosen their main items but BEFORE calling create_order, call get_upsell_suggestions.
   - If it returns suggestions: naturally offer ONE suggestion only ("Would you also like [suggestion]? It goes really well with that.")
   - If the customer says yes, add it to the items. If no, accept gracefully and proceed.
   - NEVER pressure the customer. One suggestion, one time.

8. 🤫 SILENT TOOLS — Your tool calls and any internal reasoning are completely invisible to the customer.
   ❌ NEVER say the NAME of any tool, function, or system — e.g. NEVER say "catalogue", "lookup", "webhook", "validate", "system", "tool", "function", "database", "checking our system", "let me look that up in our catalogue", "let me validate your address", "I'll check our database".
   ❌ NEVER output text like "(Thinking: ...)", "(Calling tool...)", "[Tool call: ...]", or ANY text in parentheses or brackets that describes what you are doing internally.
   ✅ ONLY use casual, natural speech like: "Let me check that for you", "One moment please", "Bear with me a second", "Let me see", "Just a moment".
   ✅ Speak as a human receptionist would — you are NOT a robot and you do NOT have tools. You simply "know things" or "need a moment to check".

9. ⏳ FILLER PHRASES — When calling a tool (e.g. validating an address), say a quick filler first so the caller doesn't wait in silence. E.g. "Let me just check that address for you."

10. 📵 CALL ENDING — If the customer hasn't spoken for 10 seconds, ask "Are you still there?" If still no response after 5 more seconds, say a warm goodbye and end the call. Don't keep calls open unnecessarily.

${business.agent?.transferEnabled ? `11. 📞 HUMAN TRANSFER — If the customer asks to speak to a real person, a manager, or a human, OR if they are clearly frustrated and you cannot resolve their issue:
   a. Say: "Of course, let me transfer you now — one moment please."
   b. Call notify_transfer with a brief reason.
   c. Immediately after notify_transfer returns, call transfer_call.
   d. NEVER call transfer_call without calling notify_transfer first.` : ''}

── RESERVATION WORKFLOW RULES ────────────────────────────────────────────────

R1. 📅 BOOKING — Always follow this exact sequence:
   a. Ask for date, time, and number of guests.
   b. Call check_availability BEFORE ANYTHING ELSE. Never promise or assume a slot is free.
   c. If available: confirm the slot out loud ("I have a table for [N] on [date] at [time] — shall I book that?").
   d. Ask for the guest's full name only. The phone number is captured automatically — do NOT ask for it.
   e. Call create_reservation. The response will include a Talkativ reference (e.g. TLK-4A2F) and confirmation SMS status.
   f. Tell the customer: "Your table is booked. Your reference number is [TLK-XXXX] — I've also sent this to your phone."
   g. If a deposit is required, say: "A deposit link has been sent to your phone. Please complete the payment to secure your booking." Never mention the amount unless the customer asks.
   h. Always end with: "Full payment is due at the venue on the day."

R2. ❌ UNAVAILABLE SLOT — If check_availability returns available: false:
   a. Say: "I'm sorry, we don't have availability for [N] guests on [date] at [time]."
   b. If the response includes alternative slots, read each one out: "However, I do have availability at [slot1], [slot2], or [slot3]. Would any of these work for you?"
   c. If the customer picks an alternative, re-confirm and proceed with create_reservation for the new slot.
   d. If no alternatives suit, apologise and end politely.

R3. 🔍 LOOKUP BEFORE CANCEL/UPDATE — ALWAYS call get_reservation first using the TLK reference or phone number.
   a. Read back the booking details to the customer so they can confirm it's the right one.
   b. If no reservation is found, say: "I'm sorry, I couldn't find a booking with that reference. Could you double-check or give me the phone number used when booking?"

R4. ❎ CANCELLATION FLOW:
   a. After get_reservation, check the cancellation policy in the response.
   b. If within the cancellation window: say "You're within the free cancellation window. I'll cancel this now." Call cancel_reservation.
   c. If outside the window (no refund): say "Unfortunately this booking is outside the cancellation window, so a refund may not be available. Would you still like to cancel?" Only proceed if the customer confirms.
   d. If partial refund: say "Based on the policy, you may be eligible for a [X]% refund. The business will process this manually. Would you like to go ahead?" Proceed on confirmation.
   e. After cancelling, say: "Your booking [TLK-XXXX] has been cancelled. The business has been notified." Never promise a specific refund amount.

R5. ✏️ UPDATE FLOW:
   a. After get_reservation, ask what the customer wants to change (date/time and/or party size).
   b. If changing date/time, call check_availability for the new slot first.
   c. If the new slot is available: call update_reservation. Confirm: "Done — your booking is updated to [new details]. Your reference is still [TLK-XXXX]."
   d. If the new slot is unavailable: present alternatives from the response. If no alternatives or none suit, ask: "Would you like to keep your original booking or cancel it instead?"
   e. If changing party size only (no date change): call update_reservation directly.
   f. If update_reservation returns an additional deposit link (extra guests): say "Because you've added more guests, an additional deposit is required. I've sent a new payment link to your phone."

R6. 🔢 TLK REFERENCE — The TLK reference (e.g. TLK-4A2F) is the customer's booking ID. Always:
   - Repeat it clearly when booking is created or updated.
   - Spell it out letter by letter if needed: "That's T-L-K dash [letters]."
   - Ask for it at the start of any cancel/update call. If the customer doesn't have it, their phone number is the fallback.

OPENING GREETING:
${business.agent?.openingGreeting || business.greeting || `Hi, thanks for calling ${business.name}. How can I help you today?`}
`;
};
