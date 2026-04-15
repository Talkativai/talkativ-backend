import twilio from 'twilio';
import { env } from '../config/env.js';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

// ─── Make outbound demo call ──────────────────────────────────────────────────
export const makeDemoCall = async (
  toNumber: string,
  agentId?: string,
  fromNumber?: string
): Promise<{ success: boolean; callSid?: string; message?: string }> => {
  try {
    const id = agentId || env.ELEVENLABS_DEMO_AGENT_ID;

    // Use explicit from → env TWILIO_PHONE_NUMBER → first purchased number
    const from = fromNumber || env.TWILIO_PHONE_NUMBER || await getExistingNumber();
    if (!from) {
      return { success: false, message: 'No outbound number available on this Twilio account' };
    }

    const call = await client.calls.create({
      to: toNumber,
      from,
      url: `https://api.elevenlabs.io/twilio/inbound_call`,
      method: 'POST',
    });

    return { success: true, callSid: call.sid };
  } catch (e: any) {
    console.error('[Twilio] Call failed:', e.message);
    return { success: false, message: e.message };
  }
};

// ─── Get the first already-purchased number on this Twilio account ────────────
const getExistingNumber = async (): Promise<string | null> => {
  try {
    const numbers = await client.incomingPhoneNumbers.list({ limit: 1 });
    if (numbers.length) {
      console.log(`[Twilio] Reusing existing number: ${numbers[0].phoneNumber}`);
      return numbers[0].phoneNumber;
    }
    return null;
  } catch (e: any) {
    console.error('[Twilio] getExistingNumber failed:', e.message);
    return null;
  }
};

// ─── Buy a phone number based on country ─────────────────────────────────────
// Uses TWILIO_BUNDLE_SID + TWILIO_ADDRESS_SID from env for countries that require them (e.g. GB).
// Returns null — without falling back to a different country — if no number is available.
// The caller is responsible for showing a "no number available" message to the user.
export const buyPhoneNumber = async (countryCode: string = 'GB'): Promise<string | null> => {
  const cc = countryCode.toUpperCase();

  try {
    const available = await client.availablePhoneNumbers(cc)
      .local
      .list({ voiceEnabled: true, limit: 5 });

    if (!available.length) {
      console.warn(`[Twilio] No local numbers available for country: ${cc}`);
      return null;
    }

    for (const num of available) {
      try {
        const params: Record<string, string> = { phoneNumber: num.phoneNumber };

        // Attach address if required by this number
        if (num.addressRequirements && num.addressRequirements !== 'none') {
          if (env.TWILIO_ADDRESS_SID) {
            params.addressSid = env.TWILIO_ADDRESS_SID;
          } else {
            const addresses = await client.addresses.list({ isoCountry: cc, limit: 1 });
            if (addresses.length) params.addressSid = addresses[0].sid;
          }
        }

        // Attach regulatory bundle if configured (required for GB, etc.)
        if (env.TWILIO_BUNDLE_SID) {
          params.bundleSid = env.TWILIO_BUNDLE_SID;
        }

        const purchased = await client.incomingPhoneNumbers.create(params as any);
        console.log(`[Twilio] Provisioned ${purchased.phoneNumber} (${cc})`);
        return purchased.phoneNumber;
      } catch (innerErr: any) {
        console.warn(`[Twilio] Buy failed for ${num.phoneNumber}:`, innerErr.message);
      }
    }

    // All purchase attempts for available numbers failed
    console.error(`[Twilio] All purchase attempts failed for country: ${cc}`);
    return null;
  } catch (e: any) {
    if (e.code === 21404) {
      // Twilio trial account can't search numbers in this region — reuse the trial number (dev only)
      console.warn('[Twilio] Trial account restriction — reusing existing number');
      return getExistingNumber();
    }
    console.error(`[Twilio] buyPhoneNumber(${cc}) failed:`, e.message);
    return null;
  }
};

// ─── Connect number to ElevenLabs agent ──────────────────────────────────────
export const connectNumberToAgent = async (
  phoneNumber: string,
  agentId: string
): Promise<boolean> => {
  try {
    const numbers = await client.incomingPhoneNumbers.list({ phoneNumber });

    if (!numbers.length) {
      console.error(`[Twilio] Number ${phoneNumber} not found`);
      return false;
    }

    // ElevenLabs routes inbound calls based on the registered phone number.
    // Use their inbound_call endpoint — ElevenLabs will look up the assigned agent.
    await client.incomingPhoneNumbers(numbers[0].sid).update({
      voiceUrl: `https://api.elevenlabs.io/twilio/inbound_call`,
      voiceMethod: 'POST',
    });

    return true;
  } catch (e: any) {
    console.error('[Twilio] Connect number failed:', e.message);
    return false;
  }
};

// ─── Release a phone number ───────────────────────────────────────────────────
export const releasePhoneNumber = async (phoneNumber: string): Promise<boolean> => {
  try {
    const numbers = await client.incomingPhoneNumbers.list({ phoneNumber });
    if (numbers.length) {
      await client.incomingPhoneNumbers(numbers[0].sid).remove();
    }
    return true;
  } catch (e: any) {
    console.error('[Twilio] Release number failed:', e.message);
    return false;
  }
};

// ─── Detect country code from address string ─────────────────────────────────
export const detectCountryFromAddress = (address: string): string => {
  const a = address.toLowerCase();

  if (a.includes('united kingdom') || a.includes(', uk') ||
      a.includes(', gb') || a.includes('england') ||
      a.includes('scotland') || a.includes('wales') ||
      a.includes('northern ireland') || a.includes('london') ||
      a.includes('manchester') || a.includes('birmingham') ||
      a.includes('liverpool') || a.includes('leeds') ||
      a.includes('bristol') || a.includes('edinburgh')) return 'GB';

  if (a.includes('united states') || a.includes(', usa') ||
      a.includes(', us') || a.includes('new york') ||
      a.includes('los angeles') || a.includes('chicago') ||
      a.includes('houston') || a.includes('phoenix')) return 'US';

  if (a.includes('nigeria') || a.includes(', ng') ||
      a.includes('lagos') || a.includes('abuja') ||
      a.includes('kano') || a.includes('ibadan')) return 'NG';

  if (a.includes('canada') || a.includes(', ca') ||
      a.includes('toronto') || a.includes('vancouver') ||
      a.includes('montreal')) return 'CA';

  if (a.includes('australia') || a.includes(', au') ||
      a.includes('sydney') || a.includes('melbourne') ||
      a.includes('brisbane')) return 'AU';

  if (a.includes('ireland') || a.includes(', ie') ||
      a.includes('dublin') || a.includes('cork')) return 'IE';

  if (a.includes('france') || a.includes(', fr') ||
      a.includes('paris') || a.includes('lyon')) return 'FR';

  if (a.includes('germany') || a.includes(', de') ||
      a.includes('berlin') || a.includes('munich')) return 'DE';

  if (a.includes('spain') || a.includes(', es') ||
      a.includes('madrid') || a.includes('barcelona')) return 'ES';

  if (a.includes('italy') || a.includes(', it') ||
      a.includes('rome') || a.includes('milan')) return 'IT';

  if (a.includes('netherlands') || a.includes(', nl') ||
      a.includes('amsterdam')) return 'NL';

  if (a.includes('uae') || a.includes('dubai') ||
      a.includes('abu dhabi') || a.includes('united arab')) return 'AE';

  if (a.includes('south africa') || a.includes(', za') ||
      a.includes('johannesburg') || a.includes('cape town')) return 'ZA';

  if (a.includes('ghana') || a.includes(', gh') ||
      a.includes('accra')) return 'GH';

  if (a.includes('kenya') || a.includes(', ke') ||
      a.includes('nairobi')) return 'KE';

  // Default to GB since that's your primary market
  return 'GB';
};

// ─── Send SMS ─────────────────────────────────────────────────────────────────
export const sendSms = async (to: string, body: string, fromNumber?: string): Promise<boolean> => {
  try {
    const from = fromNumber || env.TWILIO_PHONE_NUMBER || await getExistingNumber();
    if (!from) {
      console.error('[Twilio] sendSms: no from number available');
      return false;
    }
    await client.messages.create({ to, from, body });
    return true;
  } catch (e: any) {
    console.error('[Twilio] sendSms failed:', e.message);
    return false;
  }
};

// ─── Validate phone number format ────────────────────────────────────────────
export const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\s+/g, '');
  return /^\+[1-9]\d{7,14}$/.test(cleaned);
};
