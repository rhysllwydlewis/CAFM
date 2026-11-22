import { logo } from '../src/lib.js';

const chevron = '<svg class="i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

// The opening frame of the homepage film. Scrolling plays five more stills of the
// demo estate (exploded floors, plant room, a job closed on a phone, a second site,
// a lit window) and ends on the "See it for yourself" section shown below the fold.
const home = `<link rel="stylesheet" href="../../../apps/web/app/(marketing)/home.module.css">
<main id="top" class="home" data-world="film">
  <header class="masthead"><a class="mark" href="#top">${logo(26)} CAFM</a><a class="link" href="/login">Sign in</a>
    <a class="btn primary lg" href="/login#demo-heading">Try the demo ${chevron}</a></header>
  <section class="film" aria-label="Cardiff HQ, a demo site"><div class="stage">
    <img class="still" src="../../../apps/web/public/homepage/building.webp" alt="">
    <div class="shade"></div>
    <div class="caption" data-caption="0"><h1><span class="line"><span>Run every</span></span> <span class="line"><span><em>building.</em></span></span></h1>
      <p class="meta">Facilities management software</p>
      <div class="actions"><a class="btn primary lg big" href="/login#demo-heading">Try the demo ${chevron}</a><a class="btn lg big onFilm" href="/login">Sign in</a></div></div>
  </div></section>
  <section class="final"><h2>See it <em>for yourself.</em></h2>
    <div class="links"><a class="btn primary lg big" href="/login#demo-heading">Try the demo ${chevron}</a><a class="btn lg big onPaper" href="/login">Sign in</a></div>
    <ul class="modules"><li>Helpdesk</li><li>Work orders</li><li>Planned maintenance</li><li>Assets</li><li>Locations</li></ul>
    <footer class="footer"><span>© 2026 CAFM</span><span>Demo data only</span></footer></section>
</main>`;

export default [{id:'marketing-02-homepage',group:'Marketing site (Phase 5 draft)',title:'CAFM homepage',desc:'Public home: a scroll-directed film of the demo estate with minimal words, ending on the demo and sign-in links.',html:home}];
