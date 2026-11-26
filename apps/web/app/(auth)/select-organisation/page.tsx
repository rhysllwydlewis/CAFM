import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { OrganisationOption } from '@cafm/shared';
import { Wordmark } from '@cafm/ui';
import { apiGet } from '@/lib/api';
import { safeNext } from '@/lib/next-path';
import { OrganisationList, SignOutLink } from './organisation-list';

export const metadata: Metadata = { title: 'Choose an organisation' };

export default async function SelectOrganisationPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const res = await apiGet('/auth/organisations');
  if (res.status === 401) redirect('/login' + (next ? '?next=' + encodeURIComponent(next) : ''));
  if (!res.ok) throw new Error(`Could not load your organisations (${res.status})`);
  const organisations = (await res.json()) as OrganisationOption[];
  const count = organisations.length;
  return (
    <div className="center-screen">
      <div className="card" style={{ width: 460, maxWidth: '100%', boxShadow: 'var(--shadow-md)' }}>
        <div className="card-b" style={{ padding: 28 }}>
          <div style={{ marginBottom: 18 }}>
            <Wordmark height={26} />
          </div>
          <h1 className="dialog-title">Choose an organisation</h1>
          <div className="muted sm" style={{ margin: '4px 0 18px' }}>
            {count === 0
              ? 'Your account no longer has access to any organisation. Ask your administrator if you think this is wrong.'
              : `Your account belongs to ${count} ${count === 1 ? 'organisation' : 'organisations'}.`}
          </div>
          {count > 0 && <OrganisationList organisations={organisations} next={next} />}
          <div className="row between" style={{ marginTop: 16 }}>
            <span className="hint">{count > 1 ? 'You can switch organisation at any time from the menu.' : ''}</span>
            <SignOutLink />
          </div>
        </div>
      </div>
    </div>
  );
}
