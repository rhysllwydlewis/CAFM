import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../../auth-card';
import { MfaForm } from './mfa-form';

export const metadata: Metadata = { title: 'Two-step verification' };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Two-step verification">
      <MfaForm next={next && next.startsWith('/') && !next.startsWith('//') ? next : null} />
      <Link href="/login" className="medium">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
