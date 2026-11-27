import { wordmark } from '../../tools/logo.js';

const chevron =
  '<svg class="i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

// The homepage is one continuous shot of a London street and the city around it, played by scrolling. It is cut into
// five clips, one per chapter (street, requests, planned, compliance, estate), that join frame for frame. Each chapter
// has a headline and a sentence on one side, with a small rail of chapters on the right. Below the film come the
// product screens, who it is for, what sets it apart and the closing call to action. The logo is the real wordmark in
// the surrounding text colour, as on the live page.
const film = '../../../apps/web/public/homepage/film';
const screens = '../../../apps/web/public/homepage/screens';
const css = '<link rel="stylesheet" href="../../../apps/web/app/(marketing)/home.module.css">';
const logo = wordmark({ width: 102 }).replace(/fill="[^"]*"/g, 'fill="currentColor"');

const masthead = `<header class="masthead"><a class="mark" href="#top">${logo}</a><a class="link" href="/login">Sign in</a>
    <a class="btn primary lg" href="/login#demo-heading">Try the demo ${chevron}</a></header>`;

const actions = `<div class="actions"><a class="btn primary lg big" href="/login#demo-heading">Try the demo ${chevron}</a><a class="btn lg big ghost" href="/login">Sign in</a></div>`;

const chapters = ['Street', 'Requests', 'Planned', 'Compliance', 'Estate'];
const route = (here) =>
  `<nav class="route" aria-label="Chapters">${chapters
    .map((name, i) => `<button class="routeButton" type="button" ${i === here ? 'aria-current="step"' : ''}><span>${name}</span></button>`)
    .join('')}</nav>`;

/** One screen of the film: the first frame of the chapter's clip, the shade, the rail and the chapter's words. */
const stop = ({ poster, here, side, copy, progress }) => `<section class="film"><div class="stage" style="position:relative">
    <div class="media" aria-hidden="true"><figure class="layer" style="opacity:1"><picture><img class="poster" src="${film}/${poster}.jpg" alt=""></picture></figure></div>
    <div class="shade" aria-hidden="true"></div>
    <div class="progress" aria-hidden="true"><span style="transform:scaleX(${progress})"></span></div>
    ${route(here)}
    <div class="band" data-side="${side}" style="position:absolute;inset:0"><div class="pin" style="position:relative;height:100%"><div class="copy">${copy}</div></div></div>
  </div></section>`;

const opening = `${css}
<main id="top" class="home">
  ${masthead}
  ${stop({
    poster: 'ground-poster',
    here: 0,
    side: 'left',
    progress: 0,
    copy: `<h1 class="title">Run every building.</h1>
      <p class="body">Facilities management software for UK estates teams. Helpdesk, maintenance, assets and compliance in one place.</p>${actions}`,
  })}
</main>`;

// Part-way through the film: the compliance chapter, over the city, with its words on the right.
const compliance = `${css}
<main id="top" class="home">
  ${masthead}
  ${stop({
    poster: 'skyline-poster',
    here: 3,
    side: 'right',
    progress: 0.62,
    copy: `<h2 class="title">Compliance you can prove.</h2>
      <p class="body">Gas, electrical, fire, water hygiene, lifts and asbestos in one register, with certificates and remedial actions attached.</p>
      <ul class="tags"><li>Statutory checks</li><li>Certificates</li><li>Audit trail</li></ul>`,
  })}
</main>`;

const shot = (name, w, h, alt, caption, extra = '') =>
  `<figure class="shot ${extra}"><img src="${screens}/${name}.webp" alt="${alt}" width="${w}" height="${h}"><figcaption>${caption}</figcaption></figure>`;

const audiences = [
  ['FM service providers', 'Run many clients from one platform, with per-client SLAs, branding and reporting.'],
  ['Education', 'Multi-academy trusts, schools and colleges looking after many sites with small teams.'],
  ['Commercial property', 'Managing agents handling tenants, lease dates, service charges and contractors.'],
  ['Housing associations', 'Repairs, voids and statutory compliance in one place, ready for regulator scrutiny.'],
  ['Healthcare and hospitality', 'Reactive maintenance and compliance across clinics, shops and venues in many locations.'],
];
const strengths = [
  ['Breadth without the weight', 'One login covers helpdesk, maintenance, compliance, space and finance. Modules switch on as your plan grows.'],
  ['Yours to configure', 'Fields, forms, workflows, SLAs and roles are changed in the app by your own administrators, not by consultants.'],
  ['UK compliance built in', 'Statutory templates, certificates and remedial actions are tracked in one register, with an audit trail.'],
  ['Works offline in the field', 'Engineers and contractors keep working without a signal, and their updates sync when they are back online.'],
  ['Ready in days', 'Importers, templates and demo data get a team started quickly.'],
];

// Everything below the film: the product screens, who it is for, what sets it apart and the closing call to action.
// The top bar is clear over the film and goes solid once the film has gone, so it never sits on top of the words.
const product = `${css}
<main id="top" class="home">
  ${masthead.replace('<header class="masthead">', '<header class="masthead" data-solid="true">')}
  <section class="section" id="screens"><h2>Everything in one clear view.</h2>
    <p class="lede">From the morning overview to a single job on an engineer's phone, every screen works from the same live record.</p>
    <div class="shots">
      ${shot('overview', 1800, 1461, 'The FM Stead dashboard', 'The morning overview: open jobs, SLA, planned maintenance and compliance across every site.')}
      <div class="shotRow">
        ${shot('work-order', 1800, 1461, 'A work order for a boiler pressure fault', 'A job from report to invoice, with the full activity trail.')}
        ${shot('compliance', 1800, 1461, 'The compliance matrix', 'Statutory compliance by site and requirement, with what is overdue shown first.')}
      </div>
      ${shot('technician', 1800, 1275, 'The technician mobile app', "The technician app: today's jobs, checklists and sign-off from a phone.", 'device')}
    </div>
    <p class="footnote">Design screens, shown with demo data.</p>
  </section>
  <section class="section"><h2>Made for UK estates and FM teams.</h2>
    <ul class="rows">${audiences.map(([n, t]) => `<li><h3>${n}</h3><p>${t}</p></li>`).join('')}</ul>
  </section>
  <section class="section"><div class="apart"><div class="apartHead" style="position:static"><h2>What sets it apart.</h2></div>
    <ul>${strengths.map(([n, t]) => `<li><h3>${n}</h3><p>${t}</p></li>`).join('')}</ul></div>
  </section>
  <section class="final" id="start"><h2>One login for every site you look after.</h2>${actions}
    <footer class="footer"><span>© 2026 FM Stead · Demo data only</span><a href="#top">Back to the top</a></footer></section>
</main>`;

export default [
  {
    id: 'marketing-02-homepage',
    group: 'Marketing site (Phase 5 draft)',
    title: 'FM Stead homepage',
    desc: 'Public home: the opening of one continuous film of a London street and the city, played by scrolling, with the demo and sign-in links and the chapter rail.',
    html: opening,
  },
  {
    id: 'marketing-03-homepage-flight',
    group: 'Marketing site (Phase 5 draft)',
    title: 'FM Stead homepage, mid-film',
    desc: 'Part-way through the film: the compliance chapter over the city, with its headline, sentence and tags on the right and the chapter rail showing where you are.',
    html: compliance,
  },
  {
    id: 'marketing-04-homepage-product',
    group: 'Marketing site (Phase 5 draft)',
    title: 'FM Stead homepage, below the film',
    desc: 'After the film: the product screens, who it is for, what sets it apart, and the closing call to action and footer.',
    html: product,
  },
];
