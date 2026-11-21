import { logo } from '../src/lib.js';

const home = `<link rel="stylesheet" href="../../../apps/web/app/(marketing)/home.module.css">
<main id="top" class="home"><section class="journey" aria-label="From desk to plant room">
  <div class="stage">
    <img class="devices" src="../../../apps/web/public/homepage/devices-wide.webp" alt="">
    <header class="masthead"><a href="#top">${logo(30)} CAFM</a><nav><a href="#product">Product</a><a href="/login">Sign in</a></nav></header>
    <div class="copy"><h1>Run the estate. <span>From anywhere.</span></h1><p>Facilities management software.</p><a class="btn primary lg" href="#product">Explore CAFM</a></div>
  </div>
</section><section class="fallback"><div><h2>In the plant room.</h2><div class="order"><header><strong>WO 142</strong><span>In progress</span></header>
  <div><h3>Replace supply air filter</h3><p>AHU 02</p><label><input type="checkbox"> Filter replaced</label><button class="btn primary" disabled>Complete work order</button></div></div></div>
  <img src="../../../apps/web/public/homepage/plant-room.webp" alt="A technician beside an air handling unit"></section>
<section class="product" id="product"><h2>Explore CAFM</h2><div class="preview"><header><strong>Cardiff HQ</strong><span>Demo data</span></header>
  <div class="panel"><h3>Work orders</h3><p>WO 142 · Replace supply air filter</p></div></div></section></main>`;

export default [{id:'marketing-02-homepage',group:'Marketing site (Phase 5 draft)',title:'CAFM homepage',desc:'Public home: device sequence, plant room work order and product preview.',html:home}];
