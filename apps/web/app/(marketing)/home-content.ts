/**
 * The words and files of the homepage. The film itself is one continuous 15 second shot cut into five consecutive
 * clips (150, 180, 240, 180 and 150 frames at 60 fps), one per chapter, so each chapter's clip picks up on the frame
 * where the last one ended. The clips and their first-frame posters are in public/homepage/film.
 */
import type { FilmChapter } from './scroll-scrub';

const film = '/homepage/film';

const clips = (id: string) => ({
  clip: `${film}/${id}.mp4`,
  mobileClip: `${film}/${id}-mobile.mp4`,
  poster: `${film}/${id}-poster.jpg`,
  mobilePoster: `${film}/${id}-mobile-poster.jpg`,
});

export const CHAPTERS: readonly FilmChapter[] = [
  {
    id: 'ground',
    label: 'Street',
    title: 'Run every building.',
    body: 'Facilities management software for UK estates teams. Helpdesk, maintenance, assets and compliance in one place.',
    scroll: 1.4,
    ...clips('ground'),
  },
  {
    id: 'facade',
    label: 'Requests',
    title: 'Every request, one queue.',
    body: 'Staff report a fault in seconds. Your helpdesk triages it, sends it to the right engineer or contractor and keeps the requester informed.',
    tags: ['Helpdesk', 'Reactive jobs', 'Contractors'],
    scroll: 1.6,
    ...clips('facade'),
  },
  {
    id: 'roof',
    label: 'Planned',
    title: 'Planned, not reactive.',
    body: 'Schedule servicing and inspections against every asset, so the chiller is checked before it fails.',
    tags: ['Planned maintenance', 'Asset register'],
    scroll: 2.2,
    ...clips('roof'),
  },
  {
    id: 'skyline',
    label: 'Compliance',
    title: 'Compliance you can prove.',
    body: 'Gas, electrical, fire, water hygiene, lifts and asbestos in one register, with certificates and remedial actions attached.',
    tags: ['Statutory checks', 'Certificates', 'Audit trail'],
    side: 'right',
    scroll: 1.6,
    ...clips('skyline'),
  },
  {
    id: 'estate',
    label: 'Estate',
    title: 'Every site, one login.',
    body: 'Look after one campus or twelve. Dashboards, budgets and contractor performance across the whole estate.',
    side: 'right',
    scroll: 1.6,
    ...clips('estate'),
  },
];

export const SCREENS = {
  overview: {
    src: '/homepage/screens/overview.webp',
    width: 1800,
    height: 1461,
    alt: 'The FM Stead dashboard: open work orders, SLA performance, planned maintenance and statutory compliance across twelve sites.',
    caption: 'The morning overview: open jobs, SLA, planned maintenance and compliance across every site.',
  },
  workOrder: {
    src: '/homepage/screens/work-order.webp',
    width: 1800,
    height: 1461,
    alt: 'A work order for a boiler pressure fault, with its timeline, costs, asset history and status.',
    caption: 'A job from report to invoice, with the full activity trail.',
  },
  compliance: {
    src: '/homepage/screens/compliance.webp',
    width: 1800,
    height: 1461,
    alt: 'The compliance matrix: statutory checks for each site, with overdue and due items highlighted.',
    caption: 'Statutory compliance by site and requirement, with what is overdue shown first.',
  },
  technician: {
    src: '/homepage/screens/technician.webp',
    width: 1800,
    height: 1275,
    alt: 'The technician mobile app: a list of jobs, a job in detail and a step-by-step checklist.',
    caption: "The technician app: today's jobs, checklists and sign-off from a phone.",
  },
} as const;

export const AUDIENCES = [
  {
    name: 'FM service providers',
    text: 'Run many clients from one platform, with per-client SLAs, branding and reporting.',
  },
  {
    name: 'Education',
    text: 'Multi-academy trusts, schools and colleges looking after many sites with small teams.',
  },
  {
    name: 'Commercial property',
    text: 'Managing agents handling tenants, lease dates, service charges and contractors.',
  },
  {
    name: 'Housing associations',
    text: 'Repairs, voids and statutory compliance in one place, ready for regulator scrutiny.',
  },
  {
    name: 'Healthcare and hospitality',
    text: 'Reactive maintenance and compliance across clinics, shops and venues in many locations.',
  },
] as const;

export const STRENGTHS = [
  {
    name: 'Breadth without the weight',
    text: 'One login covers helpdesk, maintenance, compliance, space and finance. Modules switch on as your plan grows.',
  },
  {
    name: 'Yours to configure',
    text: 'Fields, forms, workflows, SLAs and roles are changed in the app by your own administrators, not by consultants.',
  },
  {
    name: 'UK compliance built in',
    text: 'Statutory templates, certificates and remedial actions are tracked in one register, with an audit trail.',
  },
  {
    name: 'Works offline in the field',
    text: 'Engineers and contractors keep working without a signal, and their updates sync when they are back online.',
  },
  {
    name: 'Ready in days',
    text: 'Importers, templates and demo data get a team started quickly.',
  },
] as const;
