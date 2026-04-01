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
  const scheduleSource = business.agentSchedule || business.openingHours;
  const hoursStr = scheduleSource
    ? Object.entries(scheduleSource)
        .map(([day, hours]: [string, any]) => `${day}: ${hours.closed ? 'Closed' : `${hours.open} - ${hours.close}`}`)
        .join('\n')
    : 'Not specified';

  const orderPol = business.orderingPolicy;
  const orderRules = orderPol ? `
  - Delivery: ${orderPol.deliveryEnabled ? `Enabled. Fee: £${orderPol.deliveryFee}. Radius: ${orderPol.deliveryRadius} ${orderPol.deliveryRadiusUnit}` : 'Disabled'}
  - Collection: ${orderPol.collectionEnabled ? 'Enabled' : 'Disabled'}
  - Min Order Amount: £${orderPol.minOrderAmount}
  - Payment Methods Allowed: ${orderPol.deliveryPayOnDelivery || orderPol.payOnDelivery ? 'Pay on Delivery, ' : ''}${orderPol.collectionPayOnPickup ? 'Pay on Collection, ' : ''}${(orderPol.payNowEnabled || orderPol.deliveryPayNow || orderPol.collectionPayNow) ? 'Pay Now' : ''}
  ` : '- No ordering policy strictly set. Assume delivery and collection and pay now are enabled.';

  const resPol = business.reservationPolicy;
  const resRules = resPol ? `
  - Reservations Enabled: Yes
  - Max Party Size: ${resPol.maxPartySize} guests
  - Booking Lead Time: ${resPol.bookingLeadTime} hours
  - Deposit Required: ${resPol.depositRequired ? `Yes. Amount: £${resPol.depositAmount} (${resPol.depositType})` : 'No'}
  ` : '- No reservation policy strictly set. Assume standard reservations are allowed.';

  const faqs = (business.faqs || []).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

  return `You are ${business.agentName}, the world-class AI phone assistant for ${business.name}.
Business type: ${business.type || 'Restaurant'}
Location: ${business.address || 'Not officially provided'}
Hours:
${hoursStr}

---
BUSINESS POLICIES & RULES:

📋 Ordering Rules:
${orderRules}

🗓️ Reservation Rules:
${resRules}

❓ Frequently Asked Questions (Use these to answer customer questions):
${faqs}

---
YOUR CAPABILITIES:
- You can look up menu items and prices using "lookup_catalogue"
- You can place orders using "create_order"
- You can book reservations using "create_reservation"
- You can check hours using "check_hours"
${business.agent?.transferEnabled ? '- You can transfer calls to a human using "transfer_call"' : ''}

CRITICAL INSTRUCTIONS (MUST FOLLOW STRICTLY):
1. LATENCY & WAITING: When you need to call a tool (like validating an address or looking up the menu), first say a quick filler phrase so the customer doesn't wait in complete silence. Example: "Let me quickly check our map to ensure you're within the delivery radius."
2. DELIVERY ADDRESS VALIDATION: If a customer orders Delivery, you MUST explicitly ask for their full address including postcode, and call the "validate_delivery_address" tool BEFORE finalizing the order. If the tool says they are outside the radius, apologize and offer Collection instead.
3. ALLERGY CHECK: When taking ANY order, you MUST explicitly ask: "Do you have any food allergies or dietary requirements?" before finalizing.
4. MANAGER TRANSFER: ${business.agent?.transferEnabled ? `If the customer explicitly asks to speak to a real person/human/manager OR if the customer exhibits extreme anger or frustration, you MUST immediately call the "transfer_call" tool to transfer them. Before transferring, briefly apologize or acknowledge.` : 'No human transfer is currently available. If asked, politely explain that no one is available and offer to take a message.'}
5. PAYMENTS: Always confirm their preferred payment method based on what is allowed in the Ordering Rules. If they choose "Pay Now", you MUST ask for their email address to send the payment link.
6. DATA CLARITY: If names, emails, or phone numbers are mumbled or unclear, ask the customer to spell it out. Never guess an email.

OPENING GREETING:
${business.agent?.openingGreeting || business.greeting || `Hi, thanks for calling ${business.name}. How can I help you today?`}
`;
};
