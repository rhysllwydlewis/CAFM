import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { AuthCard } from '../../auth-card';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await apiGet(`/auth/password-reset/${encodeURIComponent(token)}`);
  const { valid } = res.ok ? ((await res.json()) as { valid: boolean }) : { valid: false };
  return (
    <AuthCard title="Choose a new password">
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            This link has expired or has already been used. Links work once, for 30 minutes.
          </p>
          <Link href="/forgot-password" className="medium">
            Ask for a new link
          </Link>
        </>
      )}
    </AuthCard>
  );
}
