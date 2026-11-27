import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@fmstead/ui';
import type { PublicSignInMessage } from '@fmstead/shared';
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

async function signInMessage(slug: string): Promise<string | null> {
  try {
    const res = await apiGet(`/public/sign-in-message/${slug}`);
    if (!res.ok) return null;
    return ((await res.json()) as PublicSignInMessage).message;
  } catch {
    return null;
  }
}

/**
 * An organisation's own sign-in address, for people with a username and no email (doc 06).
 * The only thing shown is the sign-in message the organisation chose to publish. An unknown organisation and
 * one with no message look identical, so the page can't be used to find out which organisations exist.
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
  const message = await signInMessage(slug);
  return (
    <div className="center-screen">
      <main className="card" style={{ width: 440, maxWidth: '100%', boxShadow: 'var(--shadow-md)' }}>
        <div className="card-b stack g3" style={{ padding: 28 }}>
          <Wordmark height={26} />
          {message ? <div className="callout">{message}</div> : null}
          <LoginForm demo={null} next={next} organisation={slug} />
        </div>
      </main>
    </div>
  );
}
