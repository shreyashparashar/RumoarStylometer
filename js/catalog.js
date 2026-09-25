// RUMOAR catalogue, mirrored from the live store.
// type: crossbody | shoulder | tote | duffle | backpack
// tone: the dominant colour family, used for cohesion scoring.
// structure: 0 (soft/slouchy) to 1 (rigid/architectural), used for occasion fit.

export const STORE = 'https://shreyashm36240.wixsite.com/rumoarecom';

const P = (slug, name, type, tone, structure, price, was) => ({
  slug, name, type, tone, structure, price, was,
  img: `assets/products/${slug}.jpg`,
  url: `${STORE}/product-page/the-${slug}`,
});

export const PRODUCTS = [
  P('scuttlebutt-silver-crossbody',   'The Scuttlebutt Silver Crossbody',   'crossbody', 'silver', 0.5, 1999, 2599),
  P('innuendo-slouch-shoulder-bag',   'The Innuendo Slouch Shoulder Bag',   'shoulder',  'black',  0.3, 2499, 2799),
  P('gossipmonger-structured-tote',   'The Gossipmonger Structured Tote',   'tote',      'black',  0.9, 3999, 4499),
  P('open-secret-canvas-tote',        'The Open Secret Canvas Tote',        'tote',      'cream',  0.4, 1499, 1799),
  P('grapevine-utility-duffle',       'The Grapevine Utility Duffle',       'duffle',    'black',  0.7, 2999, 3499),
  P('undertone-olive-leather-backpack','The Undertone Olive Leather Backpack','backpack','olive',  0.6, 3499, 3799),
  P('word-of-mouth-metallic-rolltop-backpack','The Word-of-Mouth Metallic Rolltop Backpack','backpack','silver',0.5,3899,4399),
  P('idle-talk-two-tone-backpack',    'The Idle Talk Two-Tone Backpack',    'backpack',  'grey',   0.5, 2699, 2999),
  P('whisperer-minimalist-flap-backpack','The Whisperer Minimalist Flap Backpack','backpack','black',0.7,2899,3299),
  P('speculation-box-backpack',       'The Speculation Box Backpack',       'backpack',  'black',  0.9, 3199, 3799),
  P('scandal-harness-backpack',       'The Scandal Harness Backpack',       'backpack',  'black',  0.6, 3799, 4699),
  P('gossip-utility-flap-backpack',   'The Gossip Utility Flap Backpack',   'backpack',  'black',  0.6, 3299, 3599),
  P('whisper-multi-pocket-backpack',  'The Whisper Multi-Pocket Backpack',  'backpack',  'black',  0.5, 2999, 3799),
  P('classified-rolltop-backpack',    'The Classified Rolltop Backpack',    'backpack',  'black',  0.5, 3499, 4099),
  P('hearsay-backpack',               'The Hearsay Backpack',               'backpack',  'black',  0.6, 2799, 3499),
];

export const bySlug = Object.fromEntries(PRODUCTS.map(p => [p.slug, p]));

export const ARCHETYPES = [
  { id: 'old-money', name: 'Old Money', hint: 'Quiet, tailored, neutral', swatch: ['#8b6b4a', '#3d2b1c'] },
  { id: 'street',    name: 'Street / Korean', hint: 'Oversized, layered, clean', swatch: ['#4a4a4a', '#111'] },
  { id: 'creative',  name: 'Creative', hint: 'Texture, colour, a twist', swatch: ['#6d5fa8', '#2b2250'] },
  { id: 'night-out', name: 'Night Out', hint: 'Dark, sharp, a little shine', swatch: ['#c2502a', '#4a1a0a'] },
  { id: 'rock',      name: 'Rock', hint: 'Leather, black, hardware', swatch: ['#2f3f4f', '#0d1418'] },
  { id: 'bohemian',  name: 'Bohemian', hint: 'Loose, earthy, printed', swatch: ['#a58a3a', '#4a3a10'] },
];

export const OCCASIONS = [
  { id: 'date-night', name: 'Date night' },
  { id: 'concert',    name: 'Concert' },
  { id: 'office',     name: 'Office' },
  { id: 'college',    name: 'College' },
  { id: 'festival',   name: 'Festival' },
];

export const AUDIENCES = [
  { id: 'women-21-27', name: 'Women 21–27' },
  { id: 'everyone',    name: 'Everyone' },
  { id: 'men',         name: 'Men' },
];

// Things a man can declare he is already wearing in a photo.
// Each adds honest Finishing points.
export const WORN = [
  { id: 'bag', name: 'Bag', pts: 5 },
  { id: 'watch', name: 'Watch', pts: 3 },
  { id: 'eyewear', name: 'Eyewear', pts: 2 },
  { id: 'jewellery', name: 'Chain / rings', pts: 2 },
  { id: 'belt', name: 'Belt', pts: 1 },
];

// Sample looks for the Style Jury and Restyle Me. Faces are pre-blurred.
export const LOOKS = [
  { id: 'look-1', img: 'assets/looks/look-1.jpg', desc: 'Black tee, chain, sneakers' },
  { id: 'look-2', img: 'assets/looks/look-2.jpg', desc: 'Double denim' },
  { id: 'look-3', img: 'assets/looks/look-3.jpg', desc: 'Technical jacket, backpack' },
  { id: 'look-4', img: 'assets/looks/look-4.jpg', desc: 'Oversized tee, crossbody' },
  { id: 'look-5', img: 'assets/looks/look-5.jpg', desc: 'Grey knit, red messenger' },
  { id: 'look-6', img: 'assets/looks/look-6.jpg', desc: 'Black tee, bag on the floor' },
];
