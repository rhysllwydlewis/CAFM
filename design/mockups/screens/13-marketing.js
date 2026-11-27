import { wordmark } from '../../tools/logo.js';

const chevron =
  '<svg class="i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

// The homepage is one flight over a demo estate, played by scrolling: from a city square, up the facade of a tower,
// over its roof plant, above the city and out across a twelve-site district at night, then back to the square.
// The words are short: a headline at each stop, and callouts pinned to things in the footage. The logo is the real
// wordmark in the surrounding text colour, as on the live page.
const frames = '../../../apps/web/public/homepage/frames';
const logo = wordmark({ width: 102 }).replace(/fill="[^"]*"/g, 'fill="currentColor"');

const masthead = `<header class="masthead"><a class="mark" href="#top">${logo}</a><a class="link" href="/login">Sign in</a>
    <a class="btn primary lg" href="/login#demo-heading">Try the demo ${chevron}</a></header>`;

const actions = `<div class="actions"><a class="btn primary lg big" href="/login#demo-heading">Try the demo ${chevron}</a><a class="btn lg big ghost" href="/login">Sign in</a></div>`;

const rail = (here) => {
  const names = ['Ground', 'Facade', 'Roof', 'Skyline', 'Estate', 'Network', 'Square'];
  return `<div class="layer rail"><b style="height:${(here / 6) * 100}%"></b>${names
    .map(
      (name, i) =>
        `<i class="railDot" ${i <= here ? 'data-on' : ''} style="top:calc(${(i / 6) * 100}% - 4px)"></i><span class="railLabel" ${i === here ? 'data-on' : ''} style="top:${(i / 6) * 100}%">${name}</span>`,
    )
    .join('')}</div>`;
};

const opening = `<link rel="stylesheet" href="../../../apps/web/app/(marketing)/home.module.css">
<main id="top" class="home">
  ${masthead}
  <section class="film" aria-label="One flight over a demo estate"><div class="stage">
    <img class="poster" src="${frames}/f0001.webp" alt="">
    <div class="shade" data-mode="opening"></div>
    <div class="layer hero" data-on="true"><h1>Run every <em>building.</em></h1>
      <p class="lede">Facilities management software.</p>${actions}</div>
    <p class="hint" data-on="true">Scroll</p>
    <div class="layer altitude"><p>0<small>m</small></p></div>
    ${rail(0)}
  </div></section>
  <section class="final"><h2>One login for every site you look after.</h2>${actions}
    <footer class="footer"><span>© 2026 FM Stead · Demo data only</span><a href="#top">Back to the top</a></footer></section>
</main>`;

// Part-way up: on the roof, with the chapter headline and two callouts pinned to the chiller and the solar array.
const roof = `<link rel="stylesheet" href="../../../apps/web/app/(marketing)/home.module.css">
<main id="top" class="home">
  ${masthead}
  <section class="film" aria-label="One flight over a demo estate"><div class="stage">
    <img class="poster" src="${frames}/f0067.webp" alt="">
    <div class="shade" data-mode="left"></div>
    <div class="layer chapter left" data-on="true"><h2><span class="line"><span>Planned,</span></span><span class="line"><span><em>not reactive.</em></span></span></h2></div>
    <div class="callout" data-on="true" style="left:56%;top:47%"><i></i><b>Chiller 2</b><span>Serviced</span></div>
    <div class="callout" data-on="true" style="left:26%;top:60%"><i></i><b>Solar array</b><span>Checked</span></div>
    <div class="layer altitude"><p>168<small>m</small></p></div>
    ${rail(2)}
  </div></section>
</main>`;

export default [
  {
    id: 'marketing-02-homepage',
    group: 'Marketing site (Phase 5 draft)',
    title: 'FM Stead homepage',
    desc: 'Public home: the opening of one flight over a demo estate, played by scrolling, with the demo and sign-in links.',
    html: opening,
  },
  {
    id: 'marketing-03-homepage-flight',
    group: 'Marketing site (Phase 5 draft)',
    title: 'FM Stead homepage, mid-flight',
    desc: 'Part-way through the flight: on the roof, with a short headline, callouts pinned to the plant, the altitude and the stage rail.',
    html: roof,
  },
];
