import { env } from '../config/env.js';

const BASE_URL = 'https://api.elevenlabs.io/v1';

const headers = () => ({
  'xi-api-key': env.ELEVENLABS_API_KEY,
  'Content-Type': 'application/json',
});

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
          business_id: { type: 'string', description: `Always send EXACTLY this value: ${config.businessId}` },
          query: { type: 'string', description: 'Menu item name or category to search' },
        },
        required: ['business_id', 'query'],
      },
    },
    {
      type: 'webhook',
      name: 'validate_delivery_address',
      description: 'Validate a customer\'s address to ensure it falls within the delivery radius. MUST be called before creating a DELIVERY order.',
      url: `${env.BACKEND_URL}/webhooks/public/check-delivery`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: `Always send EXACTLY this value: ${config.businessId}` },
          customer_address: { type: 'string', description: 'Full address provided by the customer' },
        },
        required: ['business_id', 'customer_address'],
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
          business_id: { type: 'string', description: `Always send EXACTLY this value: ${config.businessId}` },
          customer_name: { type: 'string', description: 'Full name' },
          customer_phone: { type: 'string', description: 'Phone number' },
          customer_email: { type: 'string', description: 'Email address, required if paying now' },
          delivery_address: { type: 'string', description: 'Formatted, validated delivery address if type is DELIVERY' },
          items: { type: 'string', description: 'Comma separated list of ordered items exactly as listed in the menu' },
          type: { type: 'string', enum: ['DELIVERY', 'COLLECTION', 'DINE_IN'] },
          allergies: { type: 'string', description: 'Any food allergies or dietary requirements specifically stated by the caller' },
          payment_method: { type: 'string', enum: ['pay_now', 'pay_on_delivery', 'pay_on_collection'] },
          notes: { type: 'string', description: 'Special instructions or notes for the kitchen' },
        },
        required: ['business_id', 'customer_name', 'items', 'type', 'payment_method'],
      },
    },
    {
      type: 'webhook',
      name: 'create_reservation',
      description: 'Book a table reservation for the customer.',
      url: `${env.BACKEND_URL}/webhooks/public/create-reservation`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: `Always send EXACTLY this value: ${config.businessId}` },
          guest_name: { type: 'string' },
          guest_phone: { type: 'string' },
          guest_email: { type: 'string', description: 'Email address (required to send deposit link if applicable)' },
          guests: { type: 'number', description: 'Number of guests attending' },
          date_time: { type: 'string', description: 'ISO date string representing the requested reservation date and time' },
        },
        required: ['business_id', 'guest_name', 'guests', 'date_time'],
      },
    },
    {
      type: 'webhook',
      name: 'check_hours',
      description: 'Check the restaurant\'s exact opening and closing hours for each day.',
      url: `${env.BACKEND_URL}/webhooks/public/check-hours`,
      method: 'POST',
      body_schema: {
        type: 'object',
        properties: {
          business_id: { type: 'string', description: `Always send EXACTLY this value: ${config.businessId}` },
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
      system_tool_mapping: {
        type: 'transfer_call',
        number: config.transferNumber,
      },
    });
  }

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
  const scheduleSource = business.agentSchedule || business.openingHours;
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
  const resRules = resPol ? `
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
- lookup_catalogue — confirm a specific item is currently available/in stock before placing an order
- create_order — place a food order
- create_reservation — book a table
- check_hours — get today's opening hours
${business.agent?.transferEnabled ? '- transfer_call — transfer to a human' : ''}

RULES (follow every single one, no exceptions):

1. ❌ NEVER INVENT MENU ITEMS — This is the most important rule. The CURRENT MENU section above is the ONLY food and drink we have. If a customer asks for ANYTHING not listed there (e.g. "margherita pizza", "burger", "pasta", etc.), you MUST say "I'm sorry, we don't have that on our menu" and offer to tell them what we DO have. Never say "let me check" for items obviously not on the menu — just say we don't have it.

2. ✅ CONFIRM BEFORE ORDERING — Before finalising any order, call lookup_catalogue to confirm the exact item is currently active. If it comes back empty, say "I'm sorry, that item isn't available right now."

3. 🚚 DELIVERY VALIDATION — For any delivery order, ask for the full address including postcode, then call validate_delivery_address BEFORE confirming. If outside radius, offer collection instead.

4. 🤧 ALLERGY CHECK — Always ask "Do you have any food allergies or dietary requirements?" before finalising any order.

5. 👤 MANAGER TRANSFER — ${business.agent?.transferEnabled ? 'If the customer asks to speak to a real person or manager, or is very frustrated, immediately call transfer_call.' : 'No transfer available. Politely explain and offer to take a message.'}

6. 💳 PAYMENTS — Confirm payment method from what the Ordering Rules allow. If paying now, ask for email to send the payment link.

7. 🔡 DATA CLARITY — If a name, email, or number is unclear, ask the customer to spell it out. Never guess an email.

8. 🤫 TOOL TRANSPARENCY — Never say "let me check the catalogue", "looking up the database", or mention any tool names. Use natural phrases like "Let me see what we have" or "One moment".

9. ⏳ FILLER PHRASES — When calling a tool (e.g. validating an address), say a quick filler first so the caller doesn't wait in silence. E.g. "Let me just check that address for you."

10. 📵 CALL ENDING — If the customer hasn't spoken for 10 seconds, ask "Are you still there?" If still no response after 5 more seconds, say a warm goodbye and end the call. Don't keep calls open unnecessarily.

OPENING GREETING:
${business.agent?.openingGreeting || business.greeting || `Hi, thanks for calling ${business.name}. How can I help you today?`}
`;
};
