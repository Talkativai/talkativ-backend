import { env } from '../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Square
// ─────────────────────────────────────────────────────────────────────────────

const SQUARE_BASE_URL = env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

export const createSquarePaymentLink = async (
  cfg: { accessToken: string; locationId: string },
  orderId: string,
  description: string,
  totalAmount: number,
  currency: string,
): Promise<string | null> => {
  try {
    const body = {
      idempotency_key: orderId,
      order: {
        location_id: cfg.locationId,
        reference_id: orderId, // ← we use this to match in the redirect handler
        line_items: [
          {
            name: description.slice(0, 100),
            quantity: '1',
            base_price_money: { amount: Math.round(totalAmount * 100), currency: currency.toUpperCase() },
          },
        ],
      },
      checkout_options: {
        redirect_url: `${env.BACKEND_URL}/api/public/pos-payment-return?order_id=${orderId}&provider=square`,
        ask_for_shipping_address: false,
      },
    };

    const res = await fetch(`${SQUARE_BASE_URL}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('[Square] Payment link creation failed:', err);
      return null;
    }

    const data = await res.json() as any;
    return data.payment_link?.url ?? null;
  } catch (err) {
    console.error('[Square] createPaymentLink error:', err);
    return null;
  }
};

// Verify a Square order was actually paid (called on redirect return)
export const verifySquarePayment = async (
  cfg: { accessToken: string; locationId: string },
  orderId: string, // our order ID = Square reference_id
): Promise<boolean> => {
  try {
    const res = await fetch(`${SQUARE_BASE_URL}/v2/orders/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_ids: [cfg.locationId],
        query: { filter: { reference_id_filter: { reference_ids: [orderId] } } },
      }),
    });

    if (!res.ok) return false;
    const data = await res.json() as any;
    const order = data.orders?.[0];
    return order?.state === 'COMPLETED';
  } catch (err) {
    console.error('[Square] verifyPayment error:', err);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SumUp
// ─────────────────────────────────────────────────────────────────────────────

export const createSumUpCheckout = async (
  cfg: { apiKey: string; merchantCode: string },
  orderId: string,
  description: string,
  totalAmount: number,
  currency: string,
): Promise<string | null> => {
  try {
    const body = {
      checkout_reference: orderId,
      amount: totalAmount,
      currency: currency.toUpperCase(),
      merchant_code: cfg.merchantCode,
      description: description.slice(0, 100),
      return_url: `${env.BACKEND_URL}/api/public/pos-payment-return?order_id=${orderId}&provider=sumup`,
    };

    const res = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error('[SumUp] Checkout creation failed:', await res.text());
      return null;
    }

    const data = await res.json() as any;
    // Prefer the checkout_url field if the API returns it, otherwise construct from id
    return data.checkout_url ?? (data.id ? `https://pay.sumup.com/b2c/checkout/${data.id}` : null);
  } catch (err) {
    console.error('[SumUp] createCheckout error:', err);
    return null;
  }
};

// Verify a SumUp checkout was paid
export const verifySumUpPayment = async (
  cfg: { apiKey: string },
  orderId: string, // = checkout_reference
): Promise<boolean> => {
  try {
    const res = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) return false;
    const data = await res.json() as any;
    return data.status === 'PAID';
  } catch (err) {
    console.error('[SumUp] verifyPayment error:', err);
    return false;
  }
};
