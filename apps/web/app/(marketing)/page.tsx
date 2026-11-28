import type { Metadata } from 'next';
import { configuredAppUrl } from '@/lib/public-url';
import { Homepage } from './homepage';
import styles from './home.module.css';

const TITLE = 'FM Stead | Facilities management software';
const DESCRIPTION =
  'Run every building: helpdesk, work orders, planned maintenance, assets and compliance in one place, built for UK estates teams.';

// The demo switch and the public address are set on the running service, including on Railway after build.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const base = configuredAppUrl();
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    ...(base ? { metadataBase: new URL(base), alternates: { canonical: '/' } } : {}),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      type: 'website',
      locale: 'en_GB',
      siteName: 'FM Stead',
      images: [
        { url: '/homepage/og.jpg', width: 1200, height: 630, alt: 'The FM Stead wordmark over a city skyline at dusk' },
      ],
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/homepage/og.jpg'] },
  };
}

export default function HomePage() {
  const demo = process.env.DEMO_MODE === 'true';
  const base = configuredAppUrl();
  // Facts search engines can show about the product. "<" is escaped so the JSON can never end the script tag.
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FM Stead',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: DESCRIPTION,
    ...(base ? { url: base } : {}),
  }).replace(/</g, '\\u003c');

  return (
    <main id="top" className={styles.home}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      <a className={styles.skip} href="#start">
        Skip to {demo ? 'the demo' : 'sign in'}
      </a>
      <Homepage demo={demo} />
    </main>
  );
}
