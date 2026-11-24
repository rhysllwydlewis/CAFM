import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Logo } from '@cafm/ui';
import { apiGet } from '@/lib/api';
import { safeNext } from '@/lib/next-path';
import { LoginForm } from '../../../login/login-form';

export const metadata: Metadata = { title: 'Sign in' };

async function signedIn(): Promise<boolean> {
  try {
    return (await apiGet('/auth/me')).ok;
  } catch {
    return false;
  }
}

/**
 * An organisation's own sign-in address, for people with a username and no email (doc 06).
 * Nothing about the organisation is looked up or shown, so the page can't be used to find out
 * which organisations exist.
 */
export default async function OrganisationLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) notFound();
  const next = safeNext((await searchParams).next);
  if (await signedIn()) redirect(next ?? '/app');
  return (
    <div className="center-screen">
      <main className="card" style={{ width: 440, maxWidth: '100%', boxShadow: 'var(--shadow-md)' }}>
        <div className="card-b stack g3" style={{ padding: 28 }}>
          <div className="row" style={{ gap: 10 }}>
            <Logo size={28} />
            <b>CAFM</b>
          </div>
          <LoginForm demo={null} next={next} organisation={slug} />
        </div>
      </main>
    </div>
  );
}
