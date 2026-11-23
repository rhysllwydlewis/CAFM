/** Read models for the admin console (P1-09). */
export type AdminChecklistItem = { key: string; label: string; done: boolean; href: string };

export type AdminOverview = {
  organisation: string;
  plan: string;
  superUsers: number;
  activeUsers: number;
  /** Active members per licence type: full, mobile, contractor, requester, client, read_only. */
  licences: Record<string, number>;
  /** Active full users plus pending full invites, against the plan limit (null means unlimited). */
  fullSeats: { used: number; limit: number | null };
  pendingInvites: number;
  changesLast7Days: { count: number; people: number };
  checklist: AdminChecklistItem[];
};

export type AdminUser = {
  membershipId: string;
  name: string;
  email: string | null;
  username: string | null;
  title: string | null;
  role: string;
  roleLabel: string;
  licence: string;
  status: 'active' | 'deactivated' | 'invited';
  lastSignIn: string | null;
};

/** A team and who is in it (P1-09b). */
export type Team = {
  id: string;
  name: string;
  description: string | null;
  members: { membershipId: string; name: string; roleLabel: string }[];
};

/** Who is limited to which sites (P1-09b). Super Users and unrestricted people have `restricted: false`. */
export type SiteAccessOverview = {
  /** True when the signed-in admin is limited to certain sites and so manages only people inside them. */
  delegated: boolean;
  /** The regions and sites the admin may hand out. */
  areas: { id: string; name: string; code: string; kind: 'region' | 'site' }[];
  members: { membershipId: string; restricted: boolean; locationIds: string[] }[];
};
