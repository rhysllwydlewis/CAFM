export interface ShellNavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
  locked: boolean;
}
export interface ShellNavSection {
  label: string;
  items: ShellNavItem[];
}
export interface ShellOrganisation {
  membershipId: string;
  tenantName: string;
  plan: string;
  roleLabel: string;
  current: boolean;
}
