import { env } from '../config/env.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PosLineItem {
  name: string;
  quantity: number;
  unitPriceMinor: number; // price in smallest currency unit (pence, cents)
}

export interface PosOrderPayload {
  ourOrderId: string;
  customerName: string;
  customerPhone?: string | null;
  orderType: 'DELIVERY' | 'COLLECTION';
  deliveryAddress?: string | null;
  notes?: string | null;
  allergies?: string | null;
  lineItems: PosLineItem[];
  currency: string; // ISO 4217 e.g. "GBP"
}

export interface PosResult {
  posOrderId: string;
  posSystem: 'Square' | 'Clover';
  raw: unknown;
}

// ─── Item string parser ───────────────────────────────────────────────────────
// Parses "2x Margherita Pizza, Pasta, 3 x Coke" → [{ name, quantity }]

export const parseItemString = (items: string): Array<{ name: string; quantity: number }> => {
  return items.split(',').map(raw => {
    const trimmed = raw.trim();
    const match = trimmed.match(/^(\d+)\s*[xX]\s*(.+)$/) || trimmed.match(/^(.+?)\s+[xX]\s*(\d+)$/);
    if (match) {
      const qty = parseInt(match[1]) || parseInt(match[2]);
      const name = (match[1].match(/^\d+$/) ? match[2] : match[1]).trim();
      return { name, quantity: qty };
    }
    return { name: trimmed, quantity: 1 };
  }).filter(i => i.name.length > 0);
};

// ─── Square ───────────────────────────────────────────────────────────────────

const SQUARE_BASE = env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

export const pushOrderToSquare = async (
  credentials: { accessToken: string; locationId: string },
  payload: PosOrderPayload
): Promise<PosResult> => {
  const { accessToken, locationId } = credentials;

  const lineItems = payload.lineItems.map(item => ({
    name: item.name,
    quantity: String(item.quantity),
    base_price_money: {
      amount: item.unitPriceMinor,
      currency: payload.currency.toUpperCase(),
    },
  }));

  const fulfillment: Record<string, unknown> =
    payload.orderType === 'DELIVERY'
      ? {
          type: 'DELIVERY',
          state: 'PROPOSED',
          delivery_details: {
            recipient: {
              display_name: payload.customerName,
              ...(payload.customerPhone && { phone_number: payload.customerPhone }),
              ...(payload.deliveryAddress && {
                address: { address_line_1: payload.deliveryAddress },
              }),
            },
          },
        }
      : {
          type: 'PICKUP',
          state: 'PROPOSED',
          pickup_details: {
            recipient: {
              display_name: payload.customerName,
              ...(payload.customerPhone && { phone_number: payload.customerPhone }),
            },
            schedule_type: 'ASAP',
          },
        };

  const body: Record<string, unknown> = {
    idempotency_key: payload.ourOrderId,
    order: {
      location_id: locationId,
      reference_id: payload.ourOrderId,
      line_items: lineItems,
      fulfillments: [fulfillment],
      ...(payload.notes || payload.allergies
        ? {
            metadata: {
              ...(payload.notes && { notes: payload.notes }),
              ...(payload.allergies && { allergies: `⚠️ ALLERGIES: ${payload.allergies}` }),
            },
          }
        : {}),
    },
  };

  const res = await fetch(`${SQUARE_BASE}/v2/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-02-22',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;

  if (!res.ok || data.errors) {
    throw new Error(`Square order push failed: ${JSON.stringify(data.errors || data)}`);
  }

  return {
    posOrderId: data.order.id,
    posSystem: 'Square',
    raw: data,
  };
};

// ─── Clover ───────────────────────────────────────────────────────────────────

const CLOVER_BASE = env.CLOVER_ENVIRONMENT === 'production'
  ? 'https://www.clover.com'
  : 'https://sandbox.dev.clover.com';

export const pushOrderToClover = async (
  credentials: { accessToken: string; merchantId: string },
  payload: PosOrderPayload
): Promise<PosResult> => {
  const { accessToken, merchantId } = credentials;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const noteLines = [
    payload.customerName && `Customer: ${payload.customerName}`,
    payload.customerPhone && `Phone: ${payload.customerPhone}`,
    payload.orderType === 'DELIVERY' && payload.deliveryAddress && `Deliver to: ${payload.deliveryAddress}`,
    payload.notes && `Notes: ${payload.notes}`,
    payload.allergies && `⚠️ ALLERGIES: ${payload.allergies}`,
  ].filter(Boolean).join('\n');

  // Step 1 — create the order
  const createRes = await fetch(`${CLOVER_BASE}/v3/merchants/${merchantId}/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `${payload.orderType} — ${payload.customerName}`,
      note: noteLines || undefined,
      state: 'open',
    }),
  });

  const created = await createRes.json() as any;
  if (!createRes.ok || created.message) {
    throw new Error(`Clover order create failed: ${JSON.stringify(created)}`);
  }

  const cloverOrderId: string = created.id;

  // Step 2 — add line items
  let successCount = 0;
  for (const item of payload.lineItems) {
    const lineRes = await fetch(
      `${CLOVER_BASE}/v3/merchants/${merchantId}/orders/${cloverOrderId}/line_items`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: item.name,
          price: item.unitPriceMinor,
          unitQty: item.quantity * 1000, // Clover uses milli-units
        }),
      }
    );
    if (lineRes.ok) {
      successCount++;
    } else {
      const errBody = await lineRes.json().catch(() => ({}));
      console.error(`[Clover] Failed to add line item "${item.name}":`, errBody);
    }
  }

  // If every line item failed, delete the blank order and surface the error
  if (successCount === 0 && payload.lineItems.length > 0) {
    await fetch(`${CLOVER_BASE}/v3/merchants/${merchantId}/orders/${cloverOrderId}`, {
      method: 'DELETE',
      headers,
    }).catch(err => console.error('[Clover] Failed to delete blank order:', err));
    throw new Error(`Clover order push failed: all ${payload.lineItems.length} line items failed to add`);
  }

  return {
    posOrderId: cloverOrderId,
    posSystem: 'Clover',
    raw: created,
  };
};

// ─── Live menu fetch (read-only, no DB writes) ────────────────────────────────

export interface IntegrationMenuItem {
  name: string;
  description?: string;
  price: number;
}

export interface IntegrationMenuCategory {
  name: string;
  items: IntegrationMenuItem[];
}

export interface IntegrationMenuResult {
  source: string;
  categories: IntegrationMenuCategory[];
}

export const fetchLiveMenuFromSquare = async (
  credentials: { accessToken: string; locationId: string },
): Promise<IntegrationMenuResult> => {
  const resp = await fetch(
    `${SQUARE_BASE}/v2/catalog/list?types=ITEM,CATEGORY`,
    { headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Square-Version': '2024-02-22' } },
  );
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Square API error: ${resp.status} — ${errBody}`);
  }
  const data = await resp.json() as { objects?: any[] };
  console.log('[Square Menu] raw object count:', data.objects?.length ?? 0, 'types:', JSON.stringify([...new Set((data.objects||[]).map((o:any)=>o.type))]));
  const objects = data.objects || [];

  const catMap = new Map<string, string>();
  for (const obj of objects) {
    if (obj.type === 'CATEGORY' && obj.category_data?.name) {
      catMap.set(obj.id, obj.category_data.name);
    }
  }

  const catItems = new Map<string, IntegrationMenuItem[]>();
  for (const obj of objects) {
    if (obj.type !== 'ITEM') continue;
    const d = obj.item_data || {};
    const name: string = d.name;
    if (!name) continue;
    const variation = (d.variations || [])[0];
    const price = ((variation?.item_variation_data?.price_money?.amount || 0) / 100);
    // Square v2024+: categories stored as array; older API used category_id
    const catId = d.categories?.[0]?.id || d.category_id || d.category?.id || '__uncategorized__';
    const catName = catMap.get(catId) || 'Menu Items';
    if (!catItems.has(catName)) catItems.set(catName, []);
    catItems.get(catName)!.push({ name, description: d.description || undefined, price });
  }

  const categories: IntegrationMenuCategory[] = [];
  for (const [name, items] of catItems) categories.push({ name, items });
  return { source: 'Square', categories };
};

export const fetchLiveMenuFromClover = async (
  credentials: { accessToken: string; merchantId: string },
): Promise<IntegrationMenuResult> => {
  const resp = await fetch(
    `${CLOVER_BASE}/v3/merchants/${credentials.merchantId}/items?expand=categories&limit=500`,
    { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Clover API error: ${resp.status}`);
  const data = await resp.json() as { elements?: any[] };
  const elements = data.elements || [];

  const catItems = new Map<string, IntegrationMenuItem[]>();
  for (const item of elements) {
    const name: string = item.name;
    if (!name) continue;
    const price = (item.price || 0) / 100;
    const catName = item.categories?.elements?.[0]?.name || 'Menu Items';
    if (!catItems.has(catName)) catItems.set(catName, []);
    catItems.get(catName)!.push({ name, price });
  }

  const categories: IntegrationMenuCategory[] = [];
  for (const [name, items] of catItems) categories.push({ name, items });
  return { source: 'Clover', categories };
};

// ─── Unified push ─────────────────────────────────────────────────────────────

export const pushOrderToPOS = async (
  integration: { name: string; config: unknown },
  payload: PosOrderPayload
): Promise<PosResult | null> => {
  const config = integration.config as Record<string, string>;

  if (integration.name === 'Square') {
    if (!config?.accessToken || !config?.locationId) {
      throw new Error('Square integration missing accessToken or locationId');
    }
    return pushOrderToSquare(
      { accessToken: config.accessToken, locationId: config.locationId },
      payload
    );
  }

  if (integration.name === 'Clover') {
    if (!config?.accessToken || !config?.merchantId) {
      throw new Error('Clover integration missing accessToken or merchantId');
    }
    return pushOrderToClover(
      { accessToken: config.accessToken, merchantId: config.merchantId },
      payload
    );
  }

  return null; // unsupported POS — no push
};
