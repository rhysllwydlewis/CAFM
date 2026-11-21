// Checks WCAG 2.x contrast ratios for the key foreground/background pairs.
const hex = h => h.replace('#','').match(/../g).map(x => parseInt(x,16)/255);
const lin = c => c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const L = h => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a,b) => { const [x,y] = [L(a),L(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const pairs = [
  ['Body text on surface', '#151A22', '#FFFFFF', 4.5],
  ['Muted text on surface', '#4D5562', '#FFFFFF', 4.5],
  ['Faint text on surface', '#656E7A', '#FFFFFF', 4.5],
  ['Faint text on app bg', '#656E7A', '#F6F7F9', 4.5],
  ['Primary on surface (links)', '#136676', '#FFFFFF', 4.5],
  ['White on primary (buttons)', '#FFFFFF', '#136676', 4.5],
  ['Primary text on primary-soft', '#10525F', '#EEF7F8', 4.5],
  ['Success text on soft', '#145C37', '#ECF7F0', 4.5],
  ['Warning text on soft', '#84540B', '#FDF6E7', 4.5],
  ['Danger text on soft', '#8F2424', '#FDEEEE', 4.5],
  ['White on danger button', '#FFFFFF', '#B42D2D', 4.5],
  ['Nav text on nav bg', '#A9B1BC', '#10151C', 4.5],
  ['Nav strong on nav bg', '#F1F3F6', '#10151C', 4.5],
  ['Dark: text on surface', '#E8EBEF', '#12171E', 4.5],
  ['Dark: muted on surface', '#A3ACB8', '#12171E', 4.5],
  ['Dark: faint on surface', '#7C8693', '#12171E', 4.5],
  ['Dark: primary text on surface', '#7CC4CF', '#12171E', 4.5],
  ['Dark: white on primary button', '#FFFFFF', '#2A8090', 4.5],
  ['Status dot green vs white (non-text)', '#1F8F55', '#FFFFFF', 3.0],
  ['Status dot amber vs white (non-text)', '#C98410', '#FFFFFF', 3.0],
  ['Control border vs surface (input edge)', '#8A93A0', '#FFFFFF', 3.0],
  ['Dark: control border vs surface', '#606A77', '#12171E', 3.0],
];
let fail = 0;
for (const [n,f,b,min] of pairs) { const r = ratio(f,b); const ok = r >= min; if (!ok) fail++; console.log(`${ok?'PASS':'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${n}`); }
process.exit(fail ? 1 : 0);
