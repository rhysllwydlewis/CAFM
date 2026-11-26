import type { Metadata } from 'next';
import { TERMS_VERSION } from '@cafm/shared';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Terms of service' };

// The legal text is written and approved outside engineering; this page shows the version people accept.
export default function TermsPage() {
  return (
    <AuthCard title="Terms of service" width={560}>
      <p className="muted" style={{ margin: 0 }}>
        Version {TERMS_VERSION}. The full terms of service will be published here before FM Stead is offered to
        customers. During the pilot, your organisation&apos;s agreement with us applies.
      </p>
    </AuthCard>
  );
}
