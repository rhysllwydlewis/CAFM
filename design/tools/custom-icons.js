// Custom CAFM icons, drawn to match Lucide: 24×24 viewBox, 2px stroke,
// round caps and joins, no fills, ~2px padding. Inner SVG markup only.

const wrench = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';
const cloud = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';
const house = 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z';
const flame = (cx, cy) => `M${cx} ${cy}a2.5 2.5 0 0 1-2.5-2.5c0-1.6 1.6-2.6 2.5-4.5.9 1.9 2.5 2.9 2.5 4.5A2.5 2.5 0 0 1 ${cx} ${cy}z`;
const doc = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z';

export const custom = {
  // Modules
  'reactive': `<path d="${wrench}"/><path d="m19 13-2.5 4h4L18 21"/>`,
  'ppm': `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M15 16.5a3 3 0 1 1-1.2-2.4"/><path d="M14.2 12.2v2h2"/>`,
  'contractor': `<path d="M7 10a5 5 0 0 1 10 0"/><path d="M5 10h14"/><path d="M12 5v2.5"/><path d="M8.5 12.5a3.5 3.5 0 0 0 7 0"/><path d="M5 22v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/>`,
  'space': `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 11h8V3"/><path d="M15 21v-6h6"/>`,
  'iot': `<rect x="7" y="10" width="10" height="9" rx="2"/><path d="M10 19v2M14 19v2M10 14.5h4"/><path d="M9 6.5a4.5 4.5 0 0 1 6 0"/><path d="M6.5 4a8 8 0 0 1 11 0"/>`,
  'fleet': `<path d="M14 16V6H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1"/><path d="M14 9h4l4 4v2a1 1 0 0 1-1 1h-1"/><path d="M8 16h8"/><circle cx="6" cy="16" r="2"/><circle cx="18" cy="16" r="2"/>`,
  'ai-assistant': `<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="m13 8 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>`,

  // Actions & status
  'filter': `<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>`,
  'sla': `<circle cx="11" cy="13" r="8"/><path d="M11 9v4l2.5 1.5"/><path d="M17 2v5"/><path d="M17 2h4l-1.2 1.5L21 5h-4"/>`,
  'offline': `<path d="M17.5 19H9a7 7 0 0 1-4.6-12.3"/><path d="M9.8 5.1A7 7 0 0 1 15.7 10h1.8a4.5 4.5 0 0 1 3.2 7.7"/><path d="m2 2 20 20"/>`,
  'synced': `<path d="${cloud}"/><path d="m9.5 14.5 2 2 4-4"/>`,
  'priority-high': `<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>`,

  // Building services
  'ahu': `<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="3"/><path d="M8 9v6M5 12h6"/><path d="M14.5 9h4.5M14.5 12h4.5M14.5 15h4.5"/>`,
  'boiler': `<rect x="5" y="2" width="14" height="16" rx="2"/><path d="M9 22v-4M15 22v-4"/><path d="${flame(12, 14)}"/><path d="M8.5 5.5h3"/>`,
  'pump': `<circle cx="9" cy="14" r="6"/><circle cx="9" cy="14" r="2"/><path d="M15 14h7M9 8V4h9v4"/>`,
  'valve': `<path d="M2 12h3M19 12h3"/><path d="M5 8l14 8V8L5 16z"/><path d="M12 12V5M9 5h6"/>`,
  'water-tank': `<ellipse cx="12" cy="5" rx="8" ry="2.5"/><path d="M4 5v14c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5"/><path d="M12 10.5s-2 2.2-2 3.6a2 2 0 0 0 4 0c0-1.4-2-3.6-2-3.6z"/>`,
  'lift': `<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 2v20"/><path d="m6.5 9.5 1.5-2 1.5 2"/><path d="m14.5 7.5 1.5 2 1.5-2"/>`,
  'sensor': `<rect x="8" y="8" width="8" height="8" rx="2"/><path d="M12 12h.01"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/>`,
  'calibration': `<path d="M3.5 17a9 9 0 0 1 15.9-7.6"/><path d="m10.5 14 3-4"/><circle cx="10" cy="15" r="1.5"/><path d="m15 19 2 2 4-4"/>`,

  // Compliance & safety
  'gas-safety': `<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><path d="${flame(12, 16)}"/>`,
  'electrical-cert': `<path d="${doc}"/><path d="M14 2v6h6"/><path d="m12.5 11-3 4h4l-3 4"/>`,
  'pat-test': `<path d="M8 2v5M14 2v5"/><path d="M5 7h12v3a6 6 0 0 1-12 0z"/><path d="M11 16v6"/><path d="m15 19 2 2 4-4"/>`,
  'fire-door': `<path d="M5 22V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18"/><path d="M3 22h18"/><path d="${flame(12, 16)}"/>`,
  'emergency-lighting': `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6.5 12h7"/><path d="m10.5 9 3 3-3 3"/><path d="M17.5 9v6"/>`,
  'sprinkler': `<path d="M12 2v5"/><path d="M8 7h8l-1.5 3.5h-5z"/><path d="m7 14-1.5 2.5M10 14.5l-.5 3M14 14.5l.5 3M17 14l1.5 2.5M12 14.5V21"/>`,
  'water-hygiene': `<path d="M9 21a5 5 0 0 1-5-5c0-3 5-9 5-9s5 6 5 9a5 5 0 0 1-5 5z"/><path d="M17 14.3V4a1.5 1.5 0 0 1 3 0v10.3"/><circle cx="18.5" cy="16.5" r="2.5"/>`,
  'asbestos': `<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="m8 17.5 3-6M11.5 17.5l2.5-5M15.5 17.5 14.5 15"/>`,
  'permit': `<path d="M13 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v3"/><path d="M14 2v6h6"/><path d="M8 10h3M8 14h4"/><circle cx="16" cy="17" r="2.5"/><path d="m17.8 18.8 3.2 3.2M20 21l1-1"/>`,
  'loto': `<rect x="3" y="11" width="11" height="10" rx="2"/><path d="M5.5 11V7.5a3 3 0 0 1 6 0V11"/><path d="M8.5 15v2"/><path d="M14 14l4.5-4.5H22V13l-4.5 4.5"/>`,
  'golden-thread': `<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7.5c2 1 4-1 6 0M9 11.5c2 1 4-1 6 0"/>`,
  'damp-mould': `<path d="${house}"/><path d="M12 11.5s-2.5 2.6-2.5 4.3a2.5 2.5 0 0 0 5 0c0-1.7-2.5-4.3-2.5-4.3z"/>`,
  'void-property': `<path d="${house}"/><path d="M9 21v-6h6v6"/><path d="M8.5 11.5h.01M15.5 11.5h.01"/>`,

  // Workplace
  'floor-plan': `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h5M11 12h3M17 12h4M12 3v5M12 15v6"/>`,
  'desk': `<path d="M3 13h18M6 13v7M18 13v7"/><path d="m9 6 2 2 4-4"/>`,
  'kiosk': `<rect x="6" y="2" width="12" height="14" rx="2"/><path d="M12 16v5M8 21h8M9 7h6M9 10.5h4"/>`,
  'room-panel': `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="17" cy="9" r="1.5"/><path d="M7 9h5M7 13h9M7 16h6"/>`,

  // Data
  'carbon': `<path d="${cloud}"/><path d="M10 16.5c0-2.5 1.8-4.5 5-4.5 0 3-1.8 4.8-5 4.5zM10 16.5l2.5-2.5"/>`,
};

// Placeholder product mark (until the product is named): three stacked
// "floors" of decreasing width, reading as both a building and a work list.
export const logomark = (size = 32, { bg = '#136676', fg = '#FFFFFF' } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="${bg}"/>
  <rect x="8" y="8" width="16" height="4" rx="1.5" fill="${fg}"/>
  <rect x="8" y="14" width="12" height="4" rx="1.5" fill="${fg}" fill-opacity="0.78"/>
  <rect x="8" y="20" width="8" height="4" rx="1.5" fill="${fg}" fill-opacity="0.56"/>
</svg>`.trim();
