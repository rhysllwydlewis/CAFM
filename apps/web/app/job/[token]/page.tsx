import type { Metadata } from 'next';
import type { ContractorJob } from '@cafm/shared';
import { apiGet } from '@/lib/api';
import { ContractorJobView } from './contractor-job';

// The link is the key to the job, so it should not be indexed or passed on to other sites.
export const metadata: Metadata = {
  title: 'Your job',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function Unavailable({ heading, text }: { heading: string; text: string }) {
  return (
    <main className="page">
      <section className="card card-b stack g3">
        <h1 className="page-title">{heading}</h1>
        <p>{text}</p>
      </section>
    </main>
  );
}

export default async function ContractorJobPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await apiGet('/contractor-jobs/' + encodeURIComponent(token));
  if (response.status === 410) {
    return (
      <Unavailable
        heading="This link has expired"
        text="It has run out of time or the job was taken back. Ask the team that sent it for a new one."
      />
    );
  }
  if (response.status === 404 || response.status === 400) {
    return <Unavailable heading="This link isn’t valid" text="Check you opened the whole link from the email." />;
  }
  if (!response.ok) throw new Error('Could not load this job.');
  return <ContractorJobView token={token} initial={(await response.json()) as ContractorJob} />;
}
