import { env } from '../config/env.js';

const BASE_URL = 'https://api.elevenlabs.io/v1';

const headers = () => ({
  'xi-api-key': env.ELEVENLABS_API_KEY,
  'Content-Type': 'application/json',
});

// ─── Agent Tools Builder ──────────────────────────────────────────────────────

export const buildAgentTools = (config: {
  businessId: string;
  transferEnabled?: boolean;
  transferNumber?: string;
}): any[] => {
  const biz = `Always send EXACTLY this value: ${config.businessId}`;
  const tools: any[] = [
    {
      type: 'webhook',
      name: 'lookup_catalogue',
      description: 'Look up menu items by name or category. Use this to confirm prices or availability before creating an order.',
      url: `${env.BACKEND_URL}/webhooks/public/catalogue-lookup`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          query: { type: 'string', description: 'Menu item name or category to search' },
        },
        required: ['business_id', 'query'],
      },
    },
    {
      type: 'webhook',
      name: 'validate_delivery_address',
      description: "Validate a customer's postcode to check it falls within the delivery radius. MUST be called before creating a DELIVERY order.",
      url: `${env.BACKEND_URL}/webhooks/public/check-delivery`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          customer_postal_code: { type: 'string', description: 'Postcode provided by the customer' },
        },
        required: ['business_id', 'customer_postal_code'],
      },
    },
    {
      type: 'webhook',
      name: 'create_order',
      description: 'Place a food order. For DELIVERY, ensure you have validated the address first.',
      url: `${env.BACKEND_URL}/webhooks/public/create-order`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          conversation_id: { type: 'string', description: 'Always send EXACTLY the current conversation_id so the backend can auto-detect the caller\'s phone number' },
          customer_name: { type: 'string', description: 'Full name' },
          delivery_address: { type: 'string', description: 'Formatted, validated delivery address if type is DELIVERY' },
          items: { type: 'string', description: 'Comma separated list of ordered items exactly as listed in the menu' },
          type: { type: 'string', enum: ['DELIVERY', 'COLLECTION'] },
          allergies: { type: 'string', description: 'Any food allergies or dietary requirements specifically stated by the caller' },
          payment_method: { type: 'string', enum: ['pay_now', 'pay_on_delivery', 'pay_on_collection'] },
          notes: { type: 'string', description: 'Special instructions or notes for the kitchen' },
        },
        required: ['business_id', 'conversation_id', 'customer_name', 'items', 'type', 'payment_method'],
      },
    },
    // ── Reservation tools ────────────────────────────────────────────────────
    {
      type: 'webhook',
      name: 'check_availability',
      description: 'Check if a table is available for a given date, time, and party size. ALWAYS call this before creating a reservation.',
      url: `${env.BACKEND_URL}/webhooks/public/check-availability`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time in HH:MM 24-hour format' },
          guests: { type: 'number', description: 'Number of guests' },
        },
        required: ['business_id', 'date', 'time', 'guests'],
      },
    },
    {
      type: 'webhook',
      name: 'create_reservation',
      description: 'Book a table reservation. Only call after check_availability confirms the slot is available.',
      url: `${env.BACKEND_URL}/webhooks/public/create-reservation`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          conversation_id: { type: 'string', description: 'Always send EXACTLY the current conversation_id so the backend can auto-detect the caller\'s phone number' },
          guest_name: { type: 'string' },
          guests: { type: 'number', description: 'Number of guests attending' },
          date_time: { type: 'string', description: 'ISO 8601 date-time string for the reservation' },
        },
        required: ['business_id', 'conversation_id', 'guest_name', 'guests', 'date_time'],
      },
    },
    {
      type: 'webhook',
      name: 'get_reservation',
      description: 'Look up an existing reservation by Talkativ reference (TLK-XXXX) or phone number. Use this before cancelling or updating.',
      url: `${env.BACKEND_URL}/webhooks/public/get-reservation`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          conversation_id: { type: 'string', description: 'Always send EXACTLY the current conversation_id so the backend can auto-detect the caller\'s phone number' },
          talkativ_ref: { type: 'string', description: 'Talkativ booking reference e.g. TLK-4A2F (preferred lookup key)' },
        },
        required: ['business_id', 'conversation_id'],
      },
    },
    {
      type: 'webhook',
      name: 'cancel_reservation',
      description: 'Cancel an existing reservation. Always call get_reservation first to confirm details and inform the customer of the refund/cancellation policy.',
      url: `${env.BACKEND_URL}/webhooks/public/cancel-reservation`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          conversation_id: { type: 'string', description: 'Always send EXACTLY the current conversation_id so the backend can auto-detect the caller\'s phone number' },
          talkativ_ref: { type: 'string', description: 'Talkativ booking reference e.g. TLK-4A2F (preferred lookup key)' },
        },
        required: ['business_id', 'conversation_id'],
      },
    },
    {
      type: 'webhook',
      name: 'update_reservation',
      description: 'Update an existing reservation (party size or date/time). If the new slot is unavailable, the response will include alternative slots — present them to the customer.',
      url: `${env.BACKEND_URL}/webhooks/public/update-reservation`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
          conversation_id: { type: 'string', description: 'Always send EXACTLY the current conversation_id so the backend can auto-detect the caller\'s phone number' },
          talkativ_ref: { type: 'string', description: 'Talkativ booking reference e.g. TLK-4A2F (preferred lookup key)' },
          new_date_time: { type: 'string', description: 'New date/time as ISO 8601 string (omit if only changing guests)' },
          new_guests: { type: 'number', description: 'New party size (omit if only changing date/time)' },
        },
        required: ['business_id', 'conversation_id'],
      },
    },
    // ── Hours ────────────────────────────────────────────────────────────────
    {
      type: 'webhook',
      name: 'check_hours',
      description: "Check the restaurant's exact opening and closing hours for each day.",
      url: `${env.BACKEND_URL}/webhooks/public/check-hours`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: biz },
        },
        required: ['business_id'],
      },
    },
  ];

  if (config.transferEnabled && config.transferNumber) {
    tools.push({
      type: 'system',
      name: 'transfer_call',
      description: 'Transfer the call to a human manager.',
      system_tool_mapping: { type: 'transfer_call', number: config.transferNumber },
    });
  }

  return tools;
};

// ─── Agent Lifecycle ─────────────────────────────────────────────────────────

export const createAgent = async (config: {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  language?: string;
  businessId: string;
  transferEnabled?: boolean;
  transferNumber?: string;
}) => {
  const tools = buildAgentTools({
    businessId: config.businessId,
    transferEnabled: config.transferEnabled,
    transferNumber: config.transferNumber,
  });

  const res = await fetch(`${BASE_URL}/convai/agents/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: config.name,
      conversation_config: {
        agent: {
          prompt: { prompt: config.systemPrompt },
          first_message: config.firstMessage,
          language: config.language || 'en',
        },
        tts: { voice_id: config.voiceId },
      },
      tools,
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs createAgent failed: ${error}`);
  }
  return res.json() as Promise<{ agent_id: string }>;
};

export const updateAgent = async (agentId: string, updates: Record<string, any>) => {
  const res = await fetch(`${BASE_URL}/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs updateAgent failed: ${error}`);
  }
  return res.json();
};

// ─── Register a Twilio phone number with ElevenLabs and link to an agent ──────
// ElevenLabs needs this registration to route inbound Twilio calls to the agent.
// Step 1: POST to register the number (agent_id ignored on creation by ElevenLabs)
// Step 2: PATCH to assign the agent
export const registerPhoneNumber = async (phoneNumber: string, agentId: string): Promise<string | null> => {
  try {
    // Step 1: Try to register the number
    let phoneNumberId: string | null = null;
    const postRes = await fetch(`${BASE_URL}/convai/phone-numbers`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        phone_number: phoneNumber,
        label: 'Talkativ',
        provider: 'twilio',
        sid: env.TWILIO_ACCOUNT_SID,
        token: env.TWILIO_AUTH_TOKEN,
      }),
    });

    if (postRes.ok) {
      const data = await postRes.json() as any;
      phoneNumberId = data.phone_number_id ?? null;
      console.log('[ElevenLabs] Phone number registered:', phoneNumberId);
    } else {
      // Number may already be registered — fetch existing entry
      const err = await postRes.text();
      console.warn('[ElevenLabs] registerPhoneNumber POST failed (may already exist):', err);
      const listRes = await fetch(`${BASE_URL}/convai/phone-numbers`, { headers: headers() });
      if (listRes.ok) {
        const list = await listRes.json() as any[];
        const existing = list.find((n: any) => n.phone_number === phoneNumber);
        if (existing) phoneNumberId = existing.phone_number_id;
      }
    }

    if (!phoneNumberId) {
      console.error('[ElevenLabs] Could not get phone_number_id for', phoneNumber);
      return null;
    }

    // Step 2: Assign the agent via PATCH
    const patchRes = await fetch(`${BASE_URL}/convai/phone-numbers/${phoneNumberId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ agent_id: agentId }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.text();
      console.error('[ElevenLabs] assignAgent PATCH failed:', err);
    } else {
      console.log('[ElevenLabs] Agent assigned to phone number:', phoneNumberId);
    }

    return phoneNumberId;
  } catch (e: any) {
    console.error('[ElevenLabs] registerPhoneNumber error:', e.message);
    return null;
  }
};

export const deleteAgent = async (agentId: string) => {
  const res = await fetch(`${BASE_URL}/convai/agents/${agentId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs deleteAgent failed: ${error}`);
  }
  return true;
};

// ─── Conversation Sync ────────────────────────────────────────────────────────
// Fetch all conversations for a given agent and return them with phone metadata.
export const listConversations = async (agentId: string, pageSize = 100): Promise<any[]> => {
  const res = await fetch(
    `${BASE_URL}/convai/conversations?agent_id=${agentId}&page_size=${pageSize}`,
    { headers: headers() },
  );
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs listConversations failed: ${error}`);
  }
  const data = await res.json() as any;
  return data.conversations || [];
};

export const getConversation = async (conversationId: string): Promise<any> => {
  const res = await fetch(`${BASE_URL}/convai/conversations/${conversationId}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs getConversation failed: ${error}`);
  }
  return res.json();
};

// ─── Text-to-Speech Preview ───────────────────────────────────────────────────

export const textToSpeech = async (voiceId: string, text: string): Promise<Buffer> => {
  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${error}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

// ─── Voices ──────────────────────────────────────────────────────────────────

export const listVoices = async () => {
  const res = await fetch(`${BASE_URL}/voices`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs listVoices failed: ${error}`);
  }
  return res.json();
};

// ─── System Prompt Template ──────────────────────────────────────────────────

export const buildSystemPrompt = (business: any) => {
  // ── Hours ──────────────────────────────────────────────────────────────────
  // Always use business.openingHours — the real trading hours to tell customers.
  // agentSchedule controls when the AI is active, not what hours to advertise.
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
          // val is "09:00-17:00" format
          const [open, close] = v.split('-');
          return `${day}: ${open || v} - ${close || ''}`.trim();
        });
      hoursStr = lines.length > 0 ? lines.join('\n') : 'Not specified';
    }
  }

  // ── Menu ───────────────────────────────────────────────────────────────────
  const menuCategories: any[] = business.menuCategories || [];
  let menuSection = '';
  if (menuCategories.length > 0) {
    const lines: string[] = ['CURRENT MENU (100% accurate — this is everything we serve):'];
    for (const cat of menuCategories) {
      if (!cat.items || cat.items.length === 0) continue;
      lines.push(`\n[${cat.name}]`);
      for (const item of cat.items) {
        const price = item.price ? ` — £${item.price}` : '';
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
  const orderRules = orderPol ? `
  - Delivery: ${orderPol.deliveryEnabled ? `Enabled. Fee: £${orderPol.deliveryFee}. Radius: ${orderPol.deliveryRadius} ${orderPol.deliveryRadiusUnit}` : 'Disabled'}
  - Collection: ${orderPol.collectionEnabled ? 'Enabled' : 'Disabled'}
  - Min Order Amount: £${orderPol.minOrderAmount}
  - Payment Methods Allowed: ${orderPol.deliveryPayOnDelivery || orderPol.payOnDelivery ? 'Pay on Delivery, ' : ''}${orderPol.collectionPayOnPickup ? 'Pay on Collection, ' : ''}${(orderPol.payNowEnabled || orderPol.deliveryPayNow || orderPol.collectionPayNow) ? 'Pay Now' : ''}
  ` : '- Ordering is NOT available. Do not accept any food orders — politely inform the caller that ordering is not currently offered.';

  // ── Reservation policy ─────────────────────────────────────────────────────
  const resPol = business.reservationPolicy;
  const resRules = resPol?.reservationsEnabled ? `
  - Reservations Enabled: Yes
  - Max Party Size: ${resPol.maxPartySize} guests
  - Booking Lead Time: ${resPol.bookingLeadTime} hours
  - Deposit Required: ${resPol.depositRequired ? `Yes. Amount: £${resPol.depositAmount} (${resPol.depositType})` : 'No'}
  ` : '- Reservations are NOT available. Do not accept any table bookings — politely inform the caller that reservations are not currently offered.';

  // ── FAQs ───────────────────────────────────────────────────────────────────
  const faqs = (business.faqs || []).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

  return `You are ${business.agentName}, the AI phone assistant for ${business.name}.
Business type: ${business.type || 'Restaurant'}
Location: ${business.address || 'Not specified'}
Opening hours:
${hoursStr}

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
- lookup_catalogue — confirm a specific item is available/in stock before placing an order
- validate_delivery_address — validate the customer's postcode for delivery eligibility (MUST call before create_order for DELIVERY)
- create_order — place a food order (DELIVERY or COLLECTION)

🗓️ Reservations:
- check_availability — check if a table is available for a date, time, and party size (ALWAYS call before create_reservation)
- create_reservation — book a table (only after check_availability confirms the slot is free)
- get_reservation — look up an existing reservation by TLK reference or phone number (ALWAYS call before cancel or update)
- cancel_reservation — cancel an existing reservation
- update_reservation — update an existing reservation (date/time or party size)

🕐 General:
- check_hours — get the restaurant's opening hours for any day
${business.agent?.transferEnabled ? '- transfer_call — transfer the call to a human manager' : ''}

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

6. 💳 PAYMENTS — Confirm payment method from what the Ordering Rules allow. The customer's phone number is captured automatically from the call — do NOT ask for it. Never ask for an email address. After calling create_order: if the response includes payment_link_sent: true, tell the customer "I've sent a payment link to your phone by text message." If payment_link_sent is false or absent, DO NOT promise a payment link — instead say "Your order is confirmed, you can pay on delivery/collection."

7. 🔡 DATA CLARITY — If a name or phone number is unclear, ask the customer to repeat it. For phone numbers, read it back to confirm before proceeding.

8. 🤫 SILENT TOOLS — Your tool calls and any internal reasoning are completely invisible to the customer. NEVER output text like "(Thinking: ...)", "(Calling tool...)", "[Tool call: ...]", or ANY text in parentheses or brackets that describes what you are doing internally. Do not narrate tool usage. Use only natural speech like "Let me check that for you" or "One moment."

9. ⏳ FILLER PHRASES — When calling a tool (e.g. validating an address), say a quick filler first so the caller doesn't wait in silence. E.g. "Let me just check that address for you."

10. 📵 CALL ENDING — If the customer hasn't spoken for 10 seconds, ask "Are you still there?" If still no response after 5 more seconds, say a warm goodbye and end the call. Don't keep calls open unnecessarily.

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
