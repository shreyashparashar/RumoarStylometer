// Stylist artifacts: little SVG stickers that belong to each stylist's world.
// prop(id, a, b) -> SVG string. a = main colour, b = detail colour. Thick white
// outline so they read as stickers on any background.

const S = (inner) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;
const O = 'stroke="#fff" stroke-width="5" paint-order="stroke"';

const P = {
  'safety-pin': (a, b) => `<path d="M14 46 L44 16 a7 7 0 1 1 6 12 L22 52 a6 6 0 1 1 -8 -6z" fill="none" stroke="${a}" stroke-width="5" ${O}/><circle cx="18" cy="48" r="5" fill="${b}"/>`,
  chain: (a) => `<g fill="none" stroke="${a}" stroke-width="6" ${O}><ellipse cx="18" cy="32" rx="10" ry="7" transform="rotate(-30 18 32)"/><ellipse cx="32" cy="32" rx="10" ry="7" transform="rotate(30 32 32)"/><ellipse cx="46" cy="32" rx="10" ry="7" transform="rotate(-30 46 32)"/></g>`,
  scissors: (a, b) => `<path d="M24 22 L48 46 M40 22 L16 46" stroke="${a}" stroke-width="6" ${O}/><circle cx="16" cy="48" r="7" fill="${b}" ${O}/><circle cx="48" cy="48" r="7" fill="${b}" ${O}/>`,
  tape: (a, b) => `<rect x="10" y="22" width="44" height="20" rx="2" fill="${a}" transform="rotate(-12 32 32)" ${O}/><path d="M16 30 L48 24 M17 36 L49 30" stroke="${b}" stroke-width="2" transform="rotate(-2 32 32)"/>`,
  mic: (a, b) => `<rect x="24" y="8" width="16" height="28" rx="8" fill="${a}" ${O}/><path d="M18 30 a14 14 0 0 0 28 0 M32 44 V56 M24 56 H40" fill="none" stroke="${b}" stroke-width="5" ${O}/>`,
  sparkle: (a, b) => `<path d="M32 4 C35 22 42 29 60 32 C42 35 35 42 32 60 C29 42 22 35 4 32 C22 29 29 22 32 4z" fill="${a}" ${O}/><circle cx="50" cy="12" r="5" fill="${b}"/>`,
  spotlight: (a, b) => `<path d="M20 10 L44 10 L56 58 L8 58z" fill="${b}" opacity=".45"/><rect x="18" y="4" width="28" height="12" rx="4" fill="${a}" ${O}/>`,
  heart: (a) => `<path d="M32 56 C6 38 6 14 22 12 C28 11 31 16 32 19 C33 16 36 11 42 12 C58 14 58 38 32 56z" fill="${a}" ${O}/>`,
  cursor: (a, b) => `<path d="M14 6 L14 50 L25 40 L33 58 L41 54 L33 37 L48 37z" fill="${a}" stroke="${b}" stroke-width="3" ${O}/>`,
  loading: (a, b) => `<rect x="6" y="24" width="52" height="16" rx="8" fill="${b}" ${O}/><rect x="10" y="28" width="30" height="8" rx="4" fill="${a}"/>`,
  bubble: (a, b) => `<path d="M10 14 H54 V42 H30 L18 54 V42 H10z" fill="${a}" ${O}/><path d="M22 26 h20 M22 32 h12" stroke="${b}" stroke-width="4"/>`,
  ruler: (a, b) => `<rect x="4" y="22" width="56" height="20" rx="3" fill="${a}" transform="rotate(-20 32 32)" ${O}/><path d="M14 30v6M22 28v10M30 26v6M38 24v10M46 22v6" stroke="${b}" stroke-width="2.5" transform="rotate(-20 32 32)"/>`,
  mirror: (a, b) => `<ellipse cx="32" cy="26" rx="16" ry="20" fill="${b}" stroke="${a}" stroke-width="6" ${O}/><path d="M32 46 V60" stroke="${a}" stroke-width="7" ${O}/><path d="M24 18 L30 12" stroke="#fff" stroke-width="3"/>`,
  drop: (a) => `<path d="M32 6 C40 22 50 30 50 40 a18 18 0 0 1 -36 0 C14 30 24 22 32 6z" fill="${a}" ${O}/>`,
  dumbbell: (a, b) => `<path d="M18 32 H46" stroke="${b}" stroke-width="6" ${O}/><rect x="6" y="20" width="12" height="24" rx="3" fill="${a}" ${O}/><rect x="46" y="20" width="12" height="24" rx="3" fill="${a}" ${O}/>`,
  watch: (a, b) => `<path d="M32 4 V14" stroke="${a}" stroke-width="5" ${O}/><circle cx="32" cy="36" r="20" fill="${a}" ${O}/><circle cx="32" cy="36" r="15" fill="${b}"/><path d="M32 36 V26 M32 36 L40 40" stroke="${a}" stroke-width="3"/>`,
  crest: (a, b) => `<path d="M32 6 L54 14 V32 C54 46 44 54 32 60 C20 54 10 46 10 32 V14z" fill="${a}" ${O}/><path d="M22 30 L32 22 L42 30 L32 44z" fill="${b}"/>`,
  diamond: (a, b) => `<path d="M14 22 L24 10 H40 L50 22 L32 56z" fill="${a}" ${O}/><path d="M14 22 H50 M24 10 L32 22 L40 10 M32 22 V56" stroke="${b}" stroke-width="2" fill="none"/>`,
  cup: (a, b) => `<path d="M14 22 H46 L42 54 H18z" fill="${a}" ${O}/><path d="M46 28 a8 8 0 0 1 0 16" fill="none" stroke="${a}" stroke-width="5"/><path d="M26 14 c-3-4 3-6 0-10 M36 14 c-3-4 3-6 0-10" stroke="${b}" stroke-width="3" fill="none"/>`,
  sneaker: (a, b) => `<path d="M6 44 C6 36 10 30 18 30 L26 26 L36 36 L54 40 C58 41 60 44 58 50 H8z" fill="${a}" ${O}/><path d="M8 50 H58" stroke="${b}" stroke-width="5"/><path d="M28 32 l4 4 M24 34 l4 4" stroke="${b}" stroke-width="2.5"/>`,
  ticket: (a, b) => `<path d="M6 18 H58 V28 a4 4 0 0 0 0 8 V46 H6 V36 a4 4 0 0 0 0 -8z" fill="${a}" ${O}/><path d="M22 18 V46" stroke="${b}" stroke-width="2" stroke-dasharray="3 3"/><path d="M28 28 h20 M28 36 h14" stroke="${b}" stroke-width="3"/>`,
  cap: (a, b) => `<path d="M10 40 C10 22 20 14 32 14 C44 14 52 22 52 38z" fill="${a}" ${O}/><path d="M34 38 H60 C60 44 54 46 46 46 H34z" fill="${b}" ${O}/>`,
  spray: (a, b) => `<rect x="20" y="20" width="22" height="38" rx="5" fill="${a}" ${O}/><rect x="25" y="10" width="12" height="10" fill="${b}"/><circle cx="50" cy="12" r="3" fill="${b}"/><circle cx="56" cy="20" r="2.5" fill="${b}"/><circle cx="48" cy="22" r="2" fill="${b}"/>`,
  photocard: (a, b) => `<rect x="14" y="6" width="36" height="52" rx="5" fill="${a}" transform="rotate(8 32 32)" ${O}/><circle cx="33" cy="26" r="8" fill="${b}" transform="rotate(8 32 32)"/><path d="M22 48 h22" stroke="${b}" stroke-width="3" transform="rotate(8 32 32)"/>`,
  star: (a) => `<path d="M32 4 L40 23 L60 24 L44 37 L50 58 L32 46 L14 58 L20 37 L4 24 L24 23z" fill="${a}" ${O}/>`,
  cloud: (a) => `<path d="M16 46 a10 10 0 0 1 2 -20 a14 14 0 0 1 27 -4 a11 11 0 0 1 3 24z" fill="${a}" ${O}/>`,
  boombox: (a, b) => `<rect x="4" y="20" width="56" height="32" rx="5" fill="${a}" ${O}/><circle cx="18" cy="38" r="8" fill="${b}"/><circle cx="46" cy="38" r="8" fill="${b}"/><path d="M16 20 V12 H48 V20" fill="none" stroke="${a}" stroke-width="4"/>`,
  crown: (a, b) => `<path d="M8 48 L12 18 L24 32 L32 12 L40 32 L52 18 L56 48z" fill="${a}" ${O}/><circle cx="32" cy="40" r="4" fill="${b}"/>`,
  flame: (a, b) => `<path d="M10 46 H54 C52 56 42 58 32 58 C22 58 12 56 10 46z" fill="${b}" ${O}/><path d="M32 8 C40 20 42 28 38 36 C36 40 28 40 26 36 C22 28 26 20 32 8z" fill="${a}" ${O}/>`,
  quill: (a, b) => `<path d="M52 6 C30 10 18 28 14 50 L22 44 C34 40 46 28 52 6z" fill="${a}" ${O}/><path d="M10 58 L28 32" stroke="${b}" stroke-width="3"/>`,
  flower: (a, b) => `<g ${O}>${[0, 72, 144, 216, 288].map(r => `<ellipse cx="32" cy="18" rx="9" ry="13" fill="${a}" transform="rotate(${r} 32 32)"/>`).join('')}</g><circle cx="32" cy="32" r="8" fill="${b}"/>`,
  pick: (a, b) => `<path d="M32 58 C18 44 8 28 10 16 C12 8 22 6 32 6 C42 6 52 8 54 16 C56 28 46 44 32 58z" fill="${a}" ${O}/><path d="M26 22 L38 22" stroke="${b}" stroke-width="3"/>`,
  bolt: (a) => `<path d="M36 4 L12 36 H30 L24 60 L52 24 H34z" fill="${a}" ${O}/>`,
  amp: (a, b) => `<rect x="8" y="10" width="48" height="46" rx="4" fill="${a}" ${O}/><rect x="14" y="24" width="36" height="26" rx="3" fill="${b}"/><circle cx="18" cy="17" r="2.5" fill="${b}"/><circle cx="26" cy="17" r="2.5" fill="${b}"/>`,
  ringlight: (a, b) => `<circle cx="32" cy="26" r="20" fill="none" stroke="${a}" stroke-width="8" ${O}/><path d="M32 46 V60 M24 60 H40" stroke="${b}" stroke-width="4"/>`,
  camera: (a, b) => `<rect x="6" y="18" width="52" height="36" rx="6" fill="${a}" ${O}/><circle cx="32" cy="36" r="11" fill="${b}"/><circle cx="32" cy="36" r="5" fill="${a}"/><rect x="20" y="12" width="14" height="8" rx="2" fill="${a}"/>`,
  passport: (a, b) => `<rect x="14" y="6" width="36" height="52" rx="4" fill="${a}" ${O}/><circle cx="32" cy="28" r="9" fill="none" stroke="${b}" stroke-width="2.5"/><path d="M23 28 h18 M32 19 v18 M24 46 h16" stroke="${b}" stroke-width="2.5"/>`,
  globe: (a, b) => `<circle cx="32" cy="32" r="24" fill="${a}" ${O}/><path d="M8 32 H56 M32 8 C22 18 22 46 32 56 C42 46 42 18 32 8" fill="none" stroke="${b}" stroke-width="2.5"/>`,
  mountain: (a, b) => `<path d="M4 54 L24 18 L34 34 L42 24 L60 54z" fill="${a}" ${O}/><path d="M24 18 L19 27 L24 25 L29 27z" fill="${b}"/>`,
  rose: (a, b) => `<path d="M32 38 V60" stroke="${b}" stroke-width="4"/><path d="M32 46 C24 44 20 48 20 52 C26 52 30 50 32 46z" fill="${b}"/><path d="M18 18 C18 8 46 8 46 18 C46 32 38 38 32 38 C26 38 18 32 18 18z" fill="${a}" ${O}/><path d="M26 18 C28 12 36 12 38 18 C36 24 28 24 26 18z" fill="none" stroke="#fff" stroke-width="2"/>`,
  envelope: (a, b) => `<rect x="6" y="14" width="52" height="36" rx="3" fill="${a}" ${O}/><path d="M6 14 L32 36 L58 14" fill="none" stroke="${b}" stroke-width="3"/><path d="M32 34 C26 28 26 24 29 24 C31 24 32 26 32 27 C32 26 33 24 35 24 C38 24 38 28 32 34z" fill="${b}"/>`,
  shades: (a, b) => `<path d="M4 24 H60" stroke="${a}" stroke-width="4" ${O}/><path d="M8 24 H28 C28 36 24 40 17 40 C10 40 8 34 8 24z" fill="${a}" ${O}/><path d="M36 24 H56 C56 34 54 40 47 40 C40 40 36 36 36 24z" fill="${a}" ${O}/><path d="M12 28 l6 -2" stroke="${b}" stroke-width="2"/>`,
};

export function prop(id, a = '#EA4E26', b = '#0A0A0A') { return S((P[id] || P.star)(a, b)); }
export const PROP_IDS = Object.keys(P);
