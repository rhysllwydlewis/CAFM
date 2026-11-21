/**
 * Demo personas for the "Demo Estates Ltd" and "Starter Demo Ltd" tenants
 * (docs/plan/06-login-and-demo.md). Used by the seed and by the login page's
 * demo panel. Never shown when DEMO_MODE is off.
 */
export type PersonaGroup = 'office' | 'field' | 'other';
export type Licence = 'full' | 'mobile' | 'requester' | 'contractor' | 'client' | 'read_only';

export interface DemoPersona {
  key: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  description: string;
  licence: Licence;
  group: PersonaGroup;
  featured: boolean;
  tenant: 'demo-estates' | 'starter-demo';
  landingPage: string;
}

const p = (
  key: string,
  name: string,
  role: string,
  roleLabel: string,
  description: string,
  licence: Licence,
  group: PersonaGroup,
  featured = false,
  tenant: DemoPersona['tenant'] = 'demo-estates',
): DemoPersona => ({
  key,
  name,
  email: `${key}@demo.example`,
  role,
  roleLabel,
  description,
  licence,
  group,
  featured,
  tenant,
  landingPage: '/app',
});

export const DEMO_PERSONAS: DemoPersona[] = [
  p('superuser', 'Sam Sutton', 'super_user', 'Super User', 'Full control of the system', 'full', 'office', true),
  p('admin', 'Alex Rowe', 'administrator', 'Administrator', 'Configuration and users', 'full', 'office'),
  p('manager', 'Morgan Ellis', 'fm_manager', 'FM Manager', 'Runs the estate', 'full', 'office', true),
  p('executive', 'Evie Shaw', 'executive', 'Executive', 'Dashboards and reports', 'read_only', 'office'),
  p('helpdesk', 'Hana Patel', 'helpdesk', 'Helpdesk', 'Logs and dispatches requests', 'full', 'office', true),
  p('planner', 'Priya Shah', 'planner', 'Supervisor / Planner', 'Plans and schedules work', 'full', 'office'),
  p('finance', 'Fiona Clarke', 'finance', 'Finance', 'Budgets and approvals', 'full', 'office'),
  p('compliance', 'Colin Baxter', 'compliance', 'Compliance / H&S', 'Certificates and inspections', 'full', 'office'),
  p('stores', 'Sid Malik', 'stores', 'Stores Clerk', 'Stock and goods received', 'full', 'office'),
  p('space', 'Penny Jones', 'space_planner', 'Space Planner', 'Floor plans and moves', 'full', 'office'),
  p('technician', 'Tom Price', 'technician', 'Technician', 'Field engineer (mobile)', 'mobile', 'field', true),
  p('contractor', 'Cara Lloyd', 'contractor', 'Contractor', 'Sparks Electrical Ltd', 'contractor', 'field', true),
  p('requester', 'Riley Morgan', 'requester', 'Requester', 'Staff self-service', 'requester', 'other', true),
  p('client', 'Clara Wynne', 'client_viewer', 'Client Viewer', 'FM-provider client portal', 'client', 'other'),
  p('auditor', 'Andy Fox', 'auditor', 'Auditor', 'Read-only compliance evidence', 'read_only', 'other'),
  p(
    'starter',
    'Jordan Hale',
    'super_user',
    'Starter plan',
    'Super User on the Starter plan',
    'full',
    'other',
    false,
    'starter-demo',
  ),
];

export interface DemoTenant {
  slug: DemoPersona['tenant'];
  name: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
}

export const DEMO_TENANTS: DemoTenant[] = [
  { slug: 'demo-estates', name: 'Demo Estates Ltd', plan: 'enterprise' },
  { slug: 'starter-demo', name: 'Starter Demo Ltd', plan: 'starter' },
];

/** Demo password (doc 06). Only ever exposed when DEMO_MODE=true. */
export const DEMO_PASSWORD = 'CafmDemo!2026';

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(DEMO_PERSONAS.map((x) => [x.role, x.roleLabel]));
ROLE_LABELS.super_user = 'Super User';
