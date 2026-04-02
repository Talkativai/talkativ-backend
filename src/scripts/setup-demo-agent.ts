import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'https://api.elevenlabs.io/v1';
const API_KEY = process.env.ELEVENLABS_API_KEY;

const systemPrompt = `You are Aria, a demo AI receptionist for Talkativ.
You are demonstrating what a restaurant AI agent can do for a business.

You represent a fictional restaurant called "Tony's Pizzeria" for this demo.

Demo menu:
- Margherita Pizza: £9.99
- Pepperoni Pizza: £11.99
- BBQ Chicken Pizza: £12.99
- Garlic Bread: £3.99
- Tiramisu: £5.99
- Soft Drinks: £2.50

Opening hours: Monday to Sunday, 11am to 10pm

RULES:
- Always be warm, friendly and professional
- Tell the caller this is a demo showing what their own restaurant AI agent could do
- You can take demo orders, answer menu questions, and handle demo reservations
- Keep responses short and natural — this is a voice call
- After 2-3 minutes, wrap up by saying something like: "I hope that gives you a taste of what Talkativ can do for your restaurant. Sign up at talkativ.io to get your own AI receptionist like me."
- When caller says goodbye, end warmly and immediately`;

const firstMessage = `Hi! I'm Aria, an AI receptionist powered by Talkativ. I'm going to show you exactly what your restaurant's AI agent could sound like and do. You can ask me about our menu, place a test order, or make a reservation. What would you like to try?`;

const run = async () => {
  console.log('Creating Talkativ demo agent...');

  const res = await fetch(`${BASE_URL}/convai/agents/create`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Talkativ Demo Agent',
      conversation_config: {
        agent: {
          prompt: { prompt: systemPrompt },
          first_message: firstMessage,
          language: 'en',
        },
        tts: { voice_id: '21m00Tcm4TlvDq8ikWAM' },
      },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('Failed to create demo agent:', error);
    process.exit(1);
  }

  const data = await res.json() as any;
  console.log('\n✅ Demo agent created successfully!');
  console.log(`\nAdd this to your .env and Render environment variables:`);
  console.log(`\nELEVENLABS_DEMO_AGENT_ID=${data.agent_id}`);
};

run().catch(console.error);
