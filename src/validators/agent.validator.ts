import { z } from 'zod';

export const updateAgentSchema = z.object({
  name: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  voiceDescription: z.string().optional(),
  openingGreeting: z.string().optional(),
  closingMessage: z.string().optional(),
  transferNumber: z.string().optional(),
  transferEnabled: z.boolean().optional(),
  takeMessages: z.boolean().optional(),
  acceptOrders: z.boolean().optional(),
  takeReservations: z.boolean().optional(),
  answerAfterHours: z.boolean().optional(),
  agentSchedule: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const updateVoiceSchema = z.object({
  voiceId: z.string().min(1, 'Voice ID is required'),
  voiceName: z.string().min(1, 'Voice name is required'),
});

export const updateScriptSchema = z.object({
  openingGreeting: z.string().optional(),
  closingMessage: z.string().optional(),
  systemPrompt: z.string().optional(),
});

export const updateCallRulesSchema = z.object({
  transferNumber: z.string().optional(),
  transferEnabled: z.boolean().optional(),
  takeMessages: z.boolean().optional(),
  answerAfterHours: z.boolean().optional(),
});
