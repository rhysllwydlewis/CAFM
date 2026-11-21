import type { Feature, Permission } from '@cafm/shared';

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
  /** Hidden unless the member's role grants this (can()). */
  permission?: Permission;
  /** Shown locked, with an upgrade prompt, unless the plan includes this (feature()). */
  feature?: Feature;
  /** Roadmap phase the module arrives in (doc 08). Home is built. */
  phase?: string;
  /** What the module is for, shown on its placeholder page. */
  summary?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

const m = (
  key: string,
  label: string,
  icon: string,
  phase: string,
  summary: string,
  permission?: Permission,
  feature?: Feature,
): NavItem => ({
  key,
  label,
  icon,
  href: `/app/${key}`,
  phase,
  summary,
  permission,
  feature,
});

/** The main menu, in the order and grouping of the mockups (design/mockups/src/lib.js NAV). */
export const NAV: NavSection[] = [
  {
    label: '',
    items: [
      { key: 'home', label: 'Home', icon: 'dashboard', href: '/app' },
      m(
        'helpdesk',
        'Helpdesk',
        'helpdesk',
        '1',
        'Log, triage and track requests from staff and occupants.',
        'requests.read',
        'helpdesk',
      ),
      m(
        'work-orders',
        'Work orders',
        'work-order',
        '1',
        'Raise, assign and close reactive jobs.',
        'work_orders.read',
        'work_orders',
      ),
      m('ppm', 'Planned maintenance', 'ppm', '1', 'Schedule and track planned maintenance.', 'ppm.read', 'ppm'),
      m(
        'scheduling',
        'Scheduling',
        'dispatch',
        '2B',
        'Dispatch work to engineers and contractors.',
        'work_orders.assign',
        'scheduling',
      ),
    ],
  },
  {
    label: 'Estate',
    items: [
      m('assets', 'Assets', 'asset', '1', 'Your asset register, with history and documents.', 'assets.read', 'assets'),
      m(
        'locations',
        'Locations',
        'location',
        '1',
        'Sites, buildings, floors and rooms.',
        'locations.read',
        'locations',
      ),
      m(
        'space',
        'Space & floor plans',
        'floor-plan',
        '3',
        'Floor plans, occupancy and moves.',
        'locations.read',
        'space',
      ),
      m(
        'documents',
        'Documents',
        'documents',
        '2A',
        'Drawings, manuals and certificates in one place.',
        'locations.read',
        'documents',
      ),
    ],
  },
  {
    label: 'Compliance',
    items: [
      m(
        'compliance',
        'Compliance',
        'compliance',
        '2A',
        'Statutory compliance registers and certificates.',
        'locations.read',
        'compliance_basic',
      ),
      m(
        'inspections',
        'Inspections & audits',
        'inspection',
        '2A',
        'Inspections, audits and their findings.',
        'locations.read',
        'compliance',
      ),
      m(
        'safety',
        'Health & safety',
        'health-safety',
        '2A',
        'Incidents, permits to work and risk assessments.',
        'locations.read',
        'health_safety',
      ),
    ],
  },
  {
    label: 'Commercial',
    items: [
      m(
        'contractors',
        'Contractors',
        'contractor',
        '2A',
        'Contractor companies, their people and their insurances.',
        'work_orders.read',
        'contractors',
      ),
      m(
        'contracts',
        'Contracts & SLAs',
        'contract',
        '2B',
        'Service contracts, SLAs and performance.',
        'work_orders.read',
        'contracts',
      ),
      m('inventory', 'Inventory', 'inventory', '2B', 'Stock, stores and tools.', 'assets.read', 'inventory'),
      m(
        'purchasing',
        'Purchasing',
        'procurement',
        '2B',
        'Requisitions, purchase orders and goods received.',
        'costs.read',
        'purchasing',
      ),
      m('finance', 'Finance', 'finance', '2B', 'Budgets, invoices and costs.', 'costs.read', 'finance'),
    ],
  },
  {
    label: 'Workplace',
    items: [
      m('bookings', 'Bookings', 'booking', '3', 'Room and desk booking.', 'requests.create', 'workplace'),
      m('visitors', 'Visitors', 'visitor', '3', 'Visitor registration and sign-in.', 'requests.create', 'workplace'),
    ],
  },
  {
    label: 'Insights',
    items: [
      m(
        'energy',
        'Energy & carbon',
        'energy',
        '3',
        'Meters, consumption and carbon reporting.',
        'reports.read',
        'energy',
      ),
      m('reports', 'Reports', 'reports', '1', 'Standard reports and dashboards.', 'reports.read', 'reports'),
    ],
  },
  {
    label: 'More',
    items: [m('admin', 'Administration', 'admin', '1', 'People, roles, settings and the audit log.', 'roles.read')],
  },
];

export const NAV_ITEMS = NAV.flatMap((s) => s.items);

export function findNavItem(key: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.key === key);
}
