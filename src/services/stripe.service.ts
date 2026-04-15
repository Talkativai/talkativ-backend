import stripe from '../config/stripe.js';

// ─── Customer ────────────────────────────────────────────────────────────────

export const createCustomer = async (email: string, name: string) => {
  return stripe.customers.create({ email, name });
};

// ─── SetupIntent (collect card for trial) ────────────────────────────────────

export const createSetupIntent = async (customerId: string) => {
  return stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  });
};

// ─── Attach payment method to customer ───────────────────────────────────────

export const attachPaymentMethod = async (paymentMethodId: string, customerId: string) => {
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  // Set as default payment method
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
};

// ─── Subscription ────────────────────────────────────────────────────────────

export const createSubscription = async (params: {
  customerId: string;
  priceId: string;
  trialDays?: number;
  defaultPaymentMethod?: string;
}) => {
  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    trial_period_days: params.trialDays ?? 14,
    ...(params.defaultPaymentMethod
      ? { default_payment_method: params.defaultPaymentMethod }
      : { payment_behavior: 'default_incomplete' }),
    expand: ['latest_invoice.payment_intent'],
  });
};

export const cancelSubscription = async (subscriptionId: string) => {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
};

export const changePlan = async (subscriptionId: string, newPriceId: string) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
  });
};

// ─── Portal ──────────────────────────────────────────────────────────────────

export const createPortalSession = async (customerId: string, returnUrl: string) => {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
};

// ─── Payment Intent (direct — for non-Connect flows) ─────────────────────────

export const createPaymentIntent = async (amount: number, currency: string, metadata: Record<string, string>) => {
  return stripe.paymentIntents.create({
    amount,
    currency,
    metadata,
  });
};

// ─── Payment Intent via Stripe Connect (destination charge) ──────────────────
// Money flows: customer → our platform → (minus applicationFeeAmount) → connected account
// 0.5% platform fee is taken automatically. No change needed to the /pay frontend page.

export const createPaymentIntentWithConnect = async (
  amount: number,
  currency: string,
  metadata: Record<string, string>,
  connectedAccountId: string,
) => {
  const applicationFeeAmount = Math.round(amount * 0.005); // 0.5%
  return stripe.paymentIntents.create({
    amount,
    currency,
    metadata,
    application_fee_amount: applicationFeeAmount,
    transfer_data: { destination: connectedAccountId },
  });
};

// ─── Get default payment method details for a customer ───────────────────────

export const getDefaultPaymentMethod = async (customerId: string) => {
  const customer = await stripe.customers.retrieve(customerId) as any;
  const pmId = customer.invoice_settings?.default_payment_method;
  if (!pmId) return null;
  const pm = await stripe.paymentMethods.retrieve(pmId as string);
  return { brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
};

// ─── Get payment method card details ─────────────────────────────────────────

export const getPaymentMethodDetails = async (paymentMethodId: string) => {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  return { brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
};

// ─── Create test payment method (test mode only) ─────────────────────────────
// Creates a Stripe test PaymentMethod using the Visa 4242 test card token,
// attaches it to the given customer, and sets it as the default.

export const createTestPaymentMethod = async (customerId: string) => {
  // Create PaymentMethod from Stripe's built-in test Visa token
  const pm = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' } as any, // tok_visa creates •••• 4242 Visa test card
  });

  // Attach to customer and set as default
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  return {
    paymentMethodId: pm.id,
    brand: pm.card?.brand ?? 'visa',
    last4: pm.card?.last4 ?? '4242',
  };
};

