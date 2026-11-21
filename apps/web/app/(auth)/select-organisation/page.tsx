import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { OrganisationOption } from '@cafm/shared';
import { Logo } from '@cafm/ui';
import { apiGet } from '@/lib/api';
import { OrganisationList } from './organisation-list';

export const metadata: Metadata = { title: 'Choose an organisation' };

export default async function SelectOrganisationPage() {
  const res = await apiGet('/auth/organisations');
  if (res.status === 401) redirect('/login');
  const organisations = (await res.json()) as OrganisationOption[];
  return (
    <div className="center-screen">
      <div className="card" style={{ width: 460, maxWidth: '100%', boxShadow: 'var(--shadow-md)' }}>
        <div className="card-b" style={{ padding: 28 }}>
          <div className="row" style={{ gap: 10, marginBottom: 18 }}>
            <Logo size={28} />
            <b>CAFM</b>
          </div>
          <h1 className="dialog-title">Choose an organisation</h1>
          <div className="muted sm" style={{ margin: '4px 0 18px' }}>
            Your account belongs to {organisations.length} organisations.
          </div>
          <OrganisationList organisations={organisations} />
          <div className="hint" style={{ marginTop: 16 }}>
            You can switch organisation at any time from the menu.
          </div>
        </div>
      </div>
    </div>
  );
}
