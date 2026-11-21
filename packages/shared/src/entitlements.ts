/**
 * Entitlements (doc 07 tiers, ADR 0006). Plans unlock feature keys and set
 * limits; tenant overrides and add-ons sit on top. Checked with feature() in
 * the API, the web app and workers. Billing never gates features directly.
 */

export const PLANS = ['free', 'starter', 'professional', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

interface FeatureDef {
  label: string;
  /** Lowest plan that includes it. Omitted for add-ons, which are bought separately. */
  plan?: Plan;
  addon?: true;
}

export const FEATURES = {
  // Every plan
  helpdesk: { label: 'Helpdesk and requester portal', plan: 'free' },
  work_orders: { label: 'Reactive work orders', plan: 'free' },
  assets: { label: 'Assets', plan: 'free' },
  locations: { label: 'Locations', plan: 'free' },
  mobile: { label: 'Mobile app', plan: 'free' },
  custom_fields: { label: 'Custom fields', plan: 'free' },
  // Starter and above
  ppm: { label: 'Planned maintenance', plan: 'starter' },
  documents: { label: 'Documents', plan: 'starter' },
  compliance_basic: { label: 'Compliance certificates', plan: 'starter' },
  reports: { label: 'Standard reports', plan: 'starter' },
  // Professional and above
  compliance: { label: 'Compliance and inspections', plan: 'professional' },
  contractors: { label: 'Contractors and portal', plan: 'professional' },
  inventory: { label: 'Inventory and tools', plan: 'professional' },
  purchasing: { label: 'Purchasing', plan: 'professional' },
  finance: { label: 'Finance and budgets', plan: 'professional' },
  contracts: { label: 'Contracts and SLAs', plan: 'professional' },
  scheduling: { label: 'Scheduling and dispatch', plan: 'professional' },
  health_safety: { label: 'Health, safety and permits', plan: 'professional' },
  form_designer: { label: 'Form designer', plan: 'professional' },
  workflows: { label: 'Workflows, automation and approvals', plan: 'professional' },
  dashboards: { label: 'Dashboards and report builder', plan: 'professional' },
  api: { label: 'API and webhooks', plan: 'professional' },
  // Enterprise
  space: { label: 'Space and floor plans', plan: 'enterprise' },
  capital_planning: { label: 'Capital planning and projects', plan: 'enterprise' },
  real_estate: { label: 'Real estate and leases', plan: 'enterprise' },
  continuity: { label: 'Business continuity', plan: 'enterprise' },
  golden_thread: { label: 'Building Safety Act golden thread', plan: 'enterprise' },
  multi_client: { label: 'FM-provider multi-client', plan: 'enterprise' },
  sso: { label: 'Single sign-on and SCIM', plan: 'enterprise' },
  custom_domain: { label: 'Custom domain and white label', plan: 'enterprise' },
  // Add-ons
  workplace: { label: 'Workplace: bookings and visitors', addon: true },
  energy: { label: 'Sustainability and energy', addon: true },
  iot: { label: 'IoT and condition monitoring', addon: true },
  ai_pro: { label: 'AI Pro', addon: true },
  sfg20: { label: 'SFG20 connector', addon: true },
  fleet: { label: 'Fleet', addon: true },
} as const satisfies Record<string, FeatureDef>;

export type Feature = keyof typeof FEATURES;
export const ALL_FEATURES = Object.keys(FEATURES) as Feature[];

export function isFeature(value: string): value is Feature {
  return value in FEATURES;
}

/** Usage limits per plan. null means unlimited. */
export const LIMITS = {
  sites: { free: 1, starter: 10, professional: null, enterprise: null },
  assets: { free: 100, starter: 2500, professional: null, enterprise: null },
  custom_fields: { free: 5, starter: 25, professional: null, enterprise: null },
  full_users: { free: 3, starter: null, professional: null, enterprise: null },
} as const satisfies Record<string, Record<Plan, number | null>>;
export type Limit = keyof typeof LIMITS;

export interface EntitlementOverride {
  feature: string;
  enabled: boolean;
  limit: number | null;
}

export interface Entitlements {
  plan: Plan;
  features: Feature[];
  limits: Record<Limit, number | null>;
}

function planRank(plan: Plan): number {
  return PLANS.indexOf(plan);
}

/**
 * The tenant's effective entitlements: features included in its plan, plus
 * add-ons and overrides. An override can switch a feature on or off, or
 * (with a feature key matching a limit name) change a limit.
 */
export function resolveEntitlements(planValue: string, overrides: readonly EntitlementOverride[] = []): Entitlements {
  const plan: Plan = (PLANS as readonly string[]).includes(planValue) ? (planValue as Plan) : 'free';
  const enabled = new Set<Feature>(
    ALL_FEATURES.filter((f) => {
      const def: FeatureDef = FEATURES[f];
      return def.plan !== undefined && planRank(def.plan) <= planRank(plan);
    }),
  );
  const limits = Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, v[plan]])) as Record<
    Limit,
    number | null
  >;
  for (const o of overrides) {
    if (o.feature in LIMITS) {
      limits[o.feature as Limit] = o.limit;
      continue;
    }
    if (!isFeature(o.feature)) continue;
    if (o.enabled) enabled.add(o.feature);
    else enabled.delete(o.feature);
  }
  return { plan, features: ALL_FEATURES.filter((f) => enabled.has(f)), limits };
}

/** Front-end helper. The API checks the same thing with @RequireFeature. */
export function feature(entitlements: { features: readonly string[] } | null | undefined, key: Feature): boolean {
  return !!entitlements && entitlements.features.includes(key);
}

/** The lowest plan that includes a feature, for upgrade prompts. Undefined for add-ons. */
export function planFor(key: Feature): Plan | undefined {
  const def: FeatureDef = FEATURES[key];
  return def.plan;
}
