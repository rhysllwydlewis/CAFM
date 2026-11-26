import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, feature, type BrandingView } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { BrandingManager } from './branding-manager';

export const metadata: Metadata = { title: 'Branding' };

export default async function AdminBrandingPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect('/app');
  if (!feature(user.entitlements, 'custom_domain')) {
    return (
      <section className="card" aria-labelledby="branding-title">
        <div className="card-h">
          <h2 className="card-t" id="branding-title">
            Branding
          </h2>
        </div>
        <div className="card-b">
          <p className="muted">Branding is part of the Enterprise plan. Ask your account manager to add it.</p>
        </div>
      </section>
    );
  }
  const branding = await readAdmin<BrandingView>('/admin/branding');
  return <BrandingManager branding={branding} />;
}
