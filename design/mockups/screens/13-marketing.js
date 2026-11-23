import { logo } from '../src/lib.js';

const chevron = '<svg class="i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

// The opening frame of the homepage film: 05:00 at Cardiff HQ. Scrolling runs the
// clock through the day on the facade, then the evening as stills (floors apart,
// plant room, the last lit window) and ends on the section shown below the fold.
const home = `<link rel="stylesheet" href="../../../apps/web/app/(marketing)/home.module.css">
<main id="top" class="home" data-world="film">
  <header class="masthead"><a class="mark" href="#top">${logo(26)} CAFM</a><a class="link" href="/login">Sign in</a>
    <a class="btn primary lg" href="/login#demo-heading">Try the demo ${chevron}</a></header>
  <section class="film" aria-label="One day at Cardiff HQ, a demo site"><div class="stage">
    <img class="predawn" src="../../../apps/web/public/homepage/dawn.webp" alt="">
    <div class="shade"></div>
    <div class="intro"><h1>One day at <em>Cardiff HQ.</em></h1>
      <p class="lede">CAFM runs the helpdesk, work orders, planned maintenance, assets and locations for UK estates teams.</p>
      <div class="actions"><a class="btn primary lg big" href="/login#demo-heading">Try the demo ${chevron}</a><a class="btn lg big onFilm" href="/login">Sign in</a></div></div>
    <div class="clock"><p class="time">05:00</p><p class="where">Cardiff HQ · demo site</p></div>
  </div></section>
  <section class="final"><h2>Every day. <em>Every building.</em></h2>
    <div class="links"><a class="btn primary lg big" href="/login#demo-heading">Try the demo ${chevron}</a><a class="btn lg big onPaper" href="/login">Sign in</a></div>
    <ul class="modules"><li>Helpdesk</li><li>Work orders</li><li>Planned maintenance</li><li>Assets</li><li>Locations</li></ul>
    <footer class="footer"><span>© 2026 CAFM</span><span>Demo data only</span></footer></section>
</main>`;

export default [{id:'marketing-02-homepage',group:'Marketing site (Phase 5 draft)',title:'CAFM homepage',desc:'Public home: one day at Cardiff HQ, with scroll as the clock, ending on the demo and sign-in links.',html:home}];
