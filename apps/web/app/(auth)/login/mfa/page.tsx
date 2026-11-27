import type { Metadata } from 'next';
import Link from 'next/link';
import { safeNext } from '@/lib/next-path';
import { AuthCard } from '../../auth-card';
import { MfaForm } from './mfa-form';

export const metadata: Metadata = { title: 'Two-step verification' };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Two-step verification">
      <MfaForm next={safeNext(next)} />
      <Link href="/login" className="medium">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
