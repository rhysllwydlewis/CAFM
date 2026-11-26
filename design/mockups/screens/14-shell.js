import { wordmark } from '../../tools/logo.js';
import { I, btn, badge, seg, av, shell, card } from '../src/lib.js';

// App shell patterns added in Phase 0 (issue #19): user menu, module placeholders, mobile navigation.

const userMenu = shell({
  active: 'home',
  crumbs: ['Demo Estates Ltd', 'Home'],
  title: 'Good morning, Sam',
  sub: 'Monday 23 November',
  body: [card('Getting started', `<div class="muted">Modules appear in the menu as they are built.</div>`)],
  overlay: `<div class="popover" role="menu" style="left:16px;bottom:64px;width:300px">
    <div class="row" style="padding:14px 14px 12px;gap:10px;border-bottom:1px solid var(--border-subtle)">${av('Sam Sutton', { s: 's36' })}<div class="grow"><div class="medium">Sam Sutton</div><div class="xs faint">superuser@demo.example</div></div></div>
    <div style="padding:8px">
      <div class="xs faint medium" style="padding:6px 12px">Organisation</div>
      <div class="menu-i on">${av('Demo Estates Ltd', { s: 's20', co: true })}<span class="grow">Demo Estates Ltd</span>${I('success', 's14')}</div>
      <div class="menu-i">${av('Riverside Academy Trust', { s: 's20', co: true })}<span class="grow">Riverside Academy Trust</span><span class="xs faint">Professional</span></div>
    </div>
    <div style="padding:8px 14px 12px;border-top:1px solid var(--border-subtle)"><div class="xs faint medium" style="padding:6px 0">Theme</div>${seg([['Light', 'theme-light'], ['Dark', 'theme-dark'], ['System', 'settings']], 2)}</div>
  </div>`,
});

const navExpanded = shell({
  active: 'home',
  crumbs: ['Demo Estates Ltd', 'Home'],
  title: 'Good morning, Sam',
  sub: 'Monday 23 November',
  body: [card('Getting started', `<div class="muted">Modules appear in the menu as they are built.</div>`)],
  toggle: true,
});

const navCollapsed = shell({
  active: 'home',
  crumbs: ['Demo Estates Ltd', 'Home'],
  title: 'Good morning, Sam',
  sub: 'Monday 23 November',
  body: [card('Getting started', `<div class="muted">Modules appear in the menu as they are built.</div>`)],
  collapsed: true,
  tipFor: 'helpdesk',
});

// A short window: the menu runs past the bottom, so a soft glow on its lower edge shows there is more below.
const navScrollHint = shell({
  active: 'home',
  crumbs: ['Demo Estates Ltd', 'Home'],
  title: 'Good morning, Sam',
  sub: 'Monday 23 November',
  body: [card('Getting started', `<div class="muted">Modules appear in the menu as they are built.</div>`)],
  toggle: true,
}).replace('<div class="app', '<div style="height:100vh;min-height:0;grid-template-rows:minmax(0,1fr)" class="app');

const placeholder = (active, title, crumbs, icon, heading, text, extra = '') =>
  shell({
    active,
    crumbs,
    title,
    body: [
      `<div class="card"><div class="empty" style="padding:56px 32px"><span class="ic primary" style="width:48px;height:48px;border-radius:12px;display:inline-grid;place-items:center">${I(icon, 's24')}</span>
       <h2 style="font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--text);margin:16px 0 6px">${heading}</h2>
       <p style="margin:0 auto;max-width:460px">${text}</p>${extra}</div></div>`,
    ],
  });

const comingSoon = placeholder(
  'work-orders',
  'Work orders',
  ['Demo Estates Ltd', 'Work orders'],
  'work-order',
  'Coming in Phase 1',
  'Raise, assign and close reactive jobs. It’s on the roadmap; this page fills in when it’s ready.',
  `<div style="margin-top:16px">${badge('Phase 1', 'primary')}</div>`,
);

const locked = placeholder(
  'inspections',
  'Inspections & audits',
  ['Starter Demo Ltd', 'Inspections & audits'],
  'locked',
  'Compliance and inspections is part of the Professional plan',
  'Your organisation is on Starter. Ask your Super User about upgrading to use it.',
  `<div style="margin-top:16px">${badge('Professional', 'outline')}</div>`,
);

const mobileNav = `<div style="width:390px;height:844px;position:relative;overflow:hidden;border-right:1px solid var(--border)">
  <div class="app" style="grid-template-columns:minmax(0,1fr);grid-template-rows:auto 1fr;min-height:844px">
    <aside class="nav" style="flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--nav-border)"><div class="nav-top" style="flex:1;padding:10px 12px;flex-direction:row;align-items:center">${btn('', { icon: 'more', iconOnly: true, v: 'ghost' })}<div class="brand"><span class="brand-word">${wordmark({ inverse: true, width: 102 })}</span></div></div></aside>
    <main class="main"><div class="page" style="padding:20px 16px"><h1 class="page-title">Good morning, Sam</h1></div></main>
  </div>
  <div class="scrim"></div>
  <aside class="nav" style="position:absolute;top:0;left:0;bottom:0;width:300px">
    <div class="nav-top"><div class="row between"><div class="brand"><span class="brand-word">${wordmark({ inverse: true, width: 102 })}</span></div>${btn('Close', { sm: true, v: 'ghost' })}</div>
      <div class="tenant"><span class="t-logo">DE</span><div class="grow"><div class="t-name">Demo Estates Ltd</div><div class="t-sub">Enterprise</div></div></div></div>
    <div class="nav-scroll"><div class="nav-sec"><div class="nav-item active">${I('dashboard')}<span>Home</span></div><div class="nav-item">${I('helpdesk')}<span>Helpdesk</span></div><div class="nav-item">${I('work-order')}<span>Work orders</span></div></div>
      <div class="nav-sec"><div class="nav-label">Compliance</div><div class="nav-item">${I('compliance')}<span>Compliance</span></div></div></div>
  </aside>
</div>`;

export default [
  { id: 'shell-01-user-menu', group: 'App shell', title: 'User menu: organisation and theme', desc: 'Opened from the name at the foot of the side menu. Sign out stays a visible button beside it.', html: userMenu },
  { id: 'shell-02-module-coming', group: 'App shell', title: 'Module not built yet', desc: 'Menu items for modules that arrive in a later phase.', html: comingSoon },
  { id: 'shell-03-module-locked', group: 'App shell', title: 'Module not in the plan', desc: 'Shown when the organisation’s plan doesn’t include the module (feature()).', html: locked },
  { id: 'shell-04-mobile-nav', group: 'App shell', title: 'Navigation on a phone', desc: 'The side menu opens as a drawer from the top bar.', html: mobileNav },
  { id: 'shell-05-nav-expanded', group: 'App shell', title: 'Side menu with a collapse button', desc: 'On a desktop the side menu has a button beside the logo that collapses it to a slim icon rail. Not shown on a phone, where the menu is a drawer.', html: navExpanded },
  { id: 'shell-06-nav-collapsed', group: 'App shell', title: 'Side menu collapsed', desc: 'A 64px rail of icons that leaves more room for the page. Hover or focus an icon to see its name beside the rail (shown here on Helpdesk); the button under the logo opens the menu again. The choice is remembered.', html: navCollapsed },
  { id: 'shell-07-nav-scroll-hint', group: 'App shell', title: 'Side menu that scrolls', desc: 'When the menu is longer than the window, a soft glow on its lower edge shows there is more below. It moves to the top edge once you have scrolled, and disappears at each end. The scrollbar itself still fades in on hover.', viewport: 'short', html: navScrollHint },
];
