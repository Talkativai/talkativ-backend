export interface PlanFeatures {
  fullPosIntegrations: boolean;   // Square, Clover, Zettle (Pro+ only)
  reservationPlatforms: boolean;  // resOS, ResDiary (Pro+ only)
  callsPerMonth: number;          // monthly call cap
}

export function getPlanFeatures(plan: string): PlanFeatures {
  const isPro = plan === 'PRO' || plan === 'ENTERPRISE';
  return {
    fullPosIntegrations: isPro,
    reservationPlatforms: isPro,
    callsPerMonth: plan === 'ENTERPRISE' ? Infinity : plan === 'PRO' ? 1000 : 500,
  };
}

// Integrations restricted to Pro+ plans
export const PRO_ONLY_POS = ['Square', 'Clover', 'Zettle'];
export const PRO_ONLY_RESERVATION = ['resOS', 'ResDiary', 'OpenTable', 'Collins'];
