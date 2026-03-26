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
}) => {
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
      tools: [
        {
          type: 'webhook',
          name: 'lookup_catalogue',
          description: 'Look up menu items by name or category',
          url: `${env.BACKEND_URL}/api/webhooks/public/catalogue-lookup`,
          method: 'POST',
          body_schema: {
            type: 'object',
            properties: {
              business_id: { type: 'string', value: config.businessId },
              query: { type: 'string', description: 'Menu item name or category to search' },
            },
            required: ['business_id', 'query'],
          },
        },
        {
          type: 'webhook',
          name: 'create_order',
          description: 'Place a food order for delivery or collection',
          url: `${env.BACKEND_URL}/api/webhooks/public/create-order`,
          method: 'POST',
          body_schema: {
            type: 'object',
            properties: {
              business_id: { type: 'string', value: config.businessId },
              customer_name: { type: 'string' },
              customer_phone: { type: 'string' },
              customer_email: { type: 'string' },
              items: { type: 'string', description: 'Comma separated list of ordered items' },
              type: { type: 'string', enum: ['DELIVERY', 'COLLECTION', 'DINE_IN'] },
              allergies: { type: 'string', description: 'Any food allergies or dietary requirements' },
              payment_method: { type: 'string', enum: ['pay_now', 'pay_on_delivery', 'pay_on_collection'] },
              notes: { type: 'string' },
            },
            required: ['business_id', 'customer_name', 'items', 'type', 'payment_method'],
          },
        },
        {
          type: 'webhook',
          name: 'create_reservation',
          description: 'Book a table reservation',
          url: `${env.BACKEND_URL}/api/webhooks/public/create-reservation`,
          method: 'POST',
          body_schema: {
            type: 'object',
            properties: {
              business_id: { type: 'string', value: config.businessId },
              guest_name: { type: 'string' },
              guest_phone: { type: 'string' },
              guest_email: { type: 'string' },
              guests: { type: 'number', description: 'Number of guests' },
              date_time: { type: 'string', description: 'ISO date string for reservation' },
            },
            required: ['business_id', 'guest_name', 'guests', 'date_time'],
          },
        },
        {
          type: 'webhook',
          name: 'check_hours',
          description: 'Check the restaurant opening hours',
          url: `${env.BACKEND_URL}/api/webhooks/public/check-hours`,
          method: 'POST',
          body_schema: {
            type: 'object',
            properties: {
              business_id: { type: 'string', value: config.businessId },
            },
            required: ['business_id'],
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`ElevenLabs createAgent failed: ${error}`);
  }
  return res.json();
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

export const buildSystemPrompt = (business: {
  name: string;
  type: string;
  address: string;
  openingHours: any;
  agentName: string;
  transferNumber?: string;
  greeting: string;
}) => {
  const hoursStr = business.openingHours
    ? Object.entries(business.openingHours)
        .map(([day, hours]) => `${day}: ${hours}`)
        .join('\n')
    : 'Not specified';

  return `You are ${business.agentName}, the AI phone assistant for ${business.name}.
Business type: ${business.type}
Location: ${business.address}
Hours:
${hoursStr}

YOUR CAPABILITIES:
- Answer questions about the menu using the lookup_catalogue tool
- Take phone orders using the create_order tool
- Book reservations using the create_reservation tool
- Provide business hours using the check_hours tool

RULES:
- Always be warm, friendly, and professional
- If you cannot help, transfer to ${business.transferNumber || 'the manager'}
- Before transferring, offer to take a message
- Always match the caller's language
- Confirm orders before finalizing
- If a caller's details (name, email, address, number) are unclear, ask them to spell it out
- You MUST NOT accept orders or reservations outside of business hours. If a customer tries to order or make a reservation outside of the working hours listed above, politely let them know the business is currently closed, tell them the working hours, and suggest they call back during those times.
- When a customer is placing an order (either delivery or collection), you MUST always ask if they have any food allergies or dietary requirements before finalising the order. This is mandatory for every order.

OPENING: ${business.greeting}`;
};
