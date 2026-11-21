import type { Metadata } from 'next';
import Link from 'next/link';
import type { InviteDetails } from '@cafm/shared';
import { apiGet } from '@/lib/api';
import { AuthCard } from '../../auth-card';
import { AcceptForm } from './accept-form';

export const metadata: Metadata = { title: 'Accept invitation' };

const UNUSABLE: Record<Exclude<InviteDetails['status'], 'pending'>, string> = {
  accepted: 'This invitation has already been accepted.',
  expired: 'This invitation has expired. Ask the person who invited you to send a new one.',
  revoked: 'This invitation has been cancelled. Ask the person who invited you if you think this is wrong.',
};

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await apiGet(`/auth/invites/${encodeURIComponent(token)}`);
  if (!res.ok) {
    return (
      <AuthCard title="Invitation not found">
        <p className="muted" style={{ margin: 0 }}>
          Check the link in your email, or ask the person who invited you to send a new one.
        </p>
      </AuthCard>
    );
  }
  const invite = (await res.json()) as InviteDetails;
  if (invite.status !== 'pending') {
    return (
      <AuthCard title="Invitation can’t be used">
        <p className="muted" style={{ margin: 0 }}>
          {UNUSABLE[invite.status]}
        </p>
        <Link href="/login" className="medium">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }
  // Signed in at all? (403 means signed in but no organisation chosen yet.)
  const me = await apiGet('/auth/me');
  const signedIn = me.status !== 401;
  return (
    <AuthCard title={`Join ${invite.tenantName}`}>
      <p className="muted" style={{ margin: 0 }}>
        You&apos;ve been invited to join <b>{invite.tenantName}</b> as {invite.roleLabel}, using <b>{invite.email}</b>.
      </p>
      {invite.accountExists && !signedIn ? (
        <>
          <p style={{ margin: 0 }}>You already have a CAFM account. Sign in as {invite.email} to accept.</p>
          <Link className="btn primary lg block" href={`/login?next=${encodeURIComponent(`/accept-invite/${token}`)}`}>
            Sign in to accept
          </Link>
        </>
      ) : (
        <AcceptForm token={token} newAccount={!invite.accountExists} email={invite.email} />
      )}
    </AuthCard>
  );
}
