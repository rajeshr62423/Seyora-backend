export interface Plan {
  key: string;
  name: string;
  priceInPaise: number;
  interval: 'month';
  features: string[];
}

// Static catalog — plans change rarely enough that a DB table would just be
// indirection. priceInPaise is what's sent to Razorpay's Orders API, which
// takes amounts in the currency's smallest unit.
export const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    priceInPaise: 0,
    interval: 'month',
    features: ['Up to 3 projects', 'Community support'],
  },
  {
    key: 'pro',
    name: 'Pro',
    priceInPaise: 199900,
    interval: 'month',
    features: ['Unlimited projects', 'Priority support', 'Analytics'],
  },
  {
    key: 'business',
    name: 'Business',
    priceInPaise: 499900,
    interval: 'month',
    features: ['Everything in Pro', 'SSO', 'Dedicated support'],
  },
];

export const PAID_PLAN_KEYS = PLANS.filter((plan) => plan.priceInPaise > 0).map(
  (plan) => plan.key,
);

export function findPlan(key: string): Plan | undefined {
  return PLANS.find((plan) => plan.key === key);
}
