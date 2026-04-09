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
      url: `https://api.elevenlabs.io/v1/convai/twilio/inbound_call?agent_id=${id}`,
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

// ─── Look up the first approved bundle SID for a country ─────────────────────
const getApprovedBundleSid = async (): Promise<string | null> => {
  try {
    const res = await fetch(
      'https://numbers.twilio.com/v2/RegulatoryCompliance/Bundles?Status=twilio-approved&PageSize=20',
      {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        },
      }
    );
    const data = await res.json() as any;
    return data.results?.[0]?.sid ?? null;
  } catch {
    return null;
  }
};

// ─── Buy a phone number based on country ─────────────────────────────────────
// Automatically passes AddressSid + BundleSid for countries that require them (e.g. GB).
// On trial accounts falls back to the existing number. On paid accounts: target → GB → US.
export const buyPhoneNumber = async (countryCode: string = 'GB'): Promise<string | null> => {
  const cc = countryCode.toUpperCase();

  const tryCountry = async (cc: string): Promise<string | null> => {
    try {
      const available = await client.availablePhoneNumbers(cc)
        .local
        .list({ voiceEnabled: true, limit: 5 });

      if (!available.length) {
        console.warn(`[Twilio] No local numbers available for: ${cc}`);
        return null;
      }

      for (const num of available) {
        try {
          const params: Record<string, string> = { phoneNumber: num.phoneNumber };

          // If this number requires a local address, attach one
          if (num.addressRequirements && num.addressRequirements !== 'none') {
            const addresses = await client.addresses.list({ isoCountry: cc, limit: 1 });
            if (addresses.length) params.addressSid = addresses[0].sid;
          }

          const purchased = await client.incomingPhoneNumbers.create(params as any);
          console.log(`[Twilio] Provisioned ${purchased.phoneNumber} (${cc})`);
          return purchased.phoneNumber;
        } catch (innerErr: any) {
          // Bundle required — look up the first approved bundle and retry
          if (innerErr.code === 21649) {
            try {
              const bundleSid = await getApprovedBundleSid();
              if (!bundleSid) { console.warn('[Twilio] No approved bundle found'); continue; }

              const params2: Record<string, string> = { phoneNumber: num.phoneNumber, bundleSid };
              const addresses = await client.addresses.list({ isoCountry: cc, limit: 1 });
              if (addresses.length) params2.addressSid = addresses[0].sid;

              const purchased = await client.incomingPhoneNumbers.create(params2 as any);
              console.log(`[Twilio] Provisioned ${purchased.phoneNumber} (${cc}) with bundle`);
              return purchased.phoneNumber;
            } catch (bundleErr: any) {
              console.warn(`[Twilio] Bundle buy failed for ${num.phoneNumber}:`, bundleErr.message);
            }
          } else {
            console.warn(`[Twilio] Buy failed for ${num.phoneNumber}:`, innerErr.message);
          }
        }
      }
      return null;
    } catch (e: any) {
      if (e.code === 21404) {
        console.warn('[Twilio] Trial account: reusing existing provisioned number');
        return getExistingNumber();
      }
      console.error(`[Twilio] buyPhoneNumber(${cc}) failed:`, e.message);
      return null;
    }
  };

  const purchased = await tryCountry(cc);
  if (purchased) return purchased;

  // Fallback: reuse an existing number already on this Twilio account
  // (happens when regulatory bundles are required, e.g. UK GB numbers)
  console.warn(`[Twilio] Could not buy new number in ${cc} — falling back to existing account number`);
  return getExistingNumber();
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

    await client.incomingPhoneNumbers(numbers[0].sid).update({
      voiceUrl: `https://api.elevenlabs.io/v1/convai/twilio/inbound_call?agent_id=${agentId}`,
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

// ─── Validate phone number format ────────────────────────────────────────────
export const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\s+/g, '');
  return /^\+[1-9]\d{7,14}$/.test(cleaned);
};
