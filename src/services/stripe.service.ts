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

// ─── Payment Link (for deposits) ─────────────────────────────────────────────

export const createPaymentIntent = async (amount: number, currency: string, metadata: Record<string, string>) => {
  return stripe.paymentIntents.create({
    amount,
    currency,
    metadata,
  });
};

