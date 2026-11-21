// Dark-theme variants of representative screens (the theme is a token swap,
// so every screen supports it; these prove the palette in context).
import work from './02-helpdesk-work.js';
import compliance from './04-compliance-safety.js';
import mobile from './10-mobile.js';
import workplace from './06-workplace.js';

const dark = (list, id, newId, title) => ({ ...list.find((s) => s.id === id), id: newId, title, theme: 'dark', group: 'Dark theme' });
export default [
  dark(work, 'wo-01-list', 'dark-01-work-orders', 'Work order list (dark)'),
  dark(work, 'wo-02-detail', 'dark-02-work-order-detail', 'Work order detail (dark)'),
  dark(compliance, 'compliance-01-matrix', 'dark-03-compliance-matrix', 'Compliance matrix (dark)'),
  dark(workplace, 'space-01-floor-plan', 'dark-04-floor-plan', 'Floor plan (dark)'),
  dark(mobile, 'mobile-01-technician-jobs', 'dark-05-mobile', 'Technician app (dark)'),
];
