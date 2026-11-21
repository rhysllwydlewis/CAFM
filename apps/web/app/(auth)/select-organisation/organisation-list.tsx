'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LoginResponse, OrganisationOption } from '@cafm/shared';
import { Icon, initials } from '@cafm/ui';
import { postJson } from '@/lib/client';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

export function OrganisationList({ organisations }: { organisations: OrganisationOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(membershipId: string) {
    setBusy(membershipId);
    setError(null);
    const res = await postJson('/auth/select-organisation', { membershipId });
    if (res.ok) {
      const body = (await res.json()) as LoginResponse;
      router.push(body.status === 'signed_in' ? body.landingPage : '/login');
      router.refresh();
      return;
    }
    setBusy(null);
    setError(res.status === 401 ? 'Your session has ended. Sign in again.' : 'Something went wrong. Try again.');
  }

  return (
    <div className="stack g2">
      {error && (
        <div className="callout danger" role="alert">
          <Icon name="warning" />
          <div className="grow">{error}</div>
        </div>
      )}
      {organisations.map((o) => (
        <button
          key={o.membershipId}
          type="button"
          className="org-option"
          disabled={busy !== null}
          aria-busy={busy === o.membershipId}
          onClick={() => choose(o.membershipId)}
        >
          <span className="av co s36">{initials(o.tenantName)}</span>
          <span className="grow">
            <span className="medium" style={{ display: 'block' }}>
              {o.tenantName}
            </span>
            <span className="xs faint">
              {PLAN_LABELS[o.plan] ?? o.plan} · {o.roleLabel}
            </span>
          </span>
          <Icon name="chevron-right" />
        </button>
      ))}
    </div>
  );
}
