// Ember Duel — the card catalogue.
// Four suits, each with a colour and a glyph drawn on the card face, so a
// suit is told apart by colour AND shape, never by text alone.
// Resonance: playing two cards of the same suit in one turn adds +2 to
// the second card's damage or healing. That is the combo to play around.

export const SUITS = {
  flame: { name: 'Flame', color: '#ff6b35', dark: '#a83208', glyph: '▲' },
  spark: { name: 'Spark', color: '#ffc53d', dark: '#8a6d00', glyph: '✦' },
  frost: { name: 'Frost', color: '#6ec6ff', dark: '#1d5f8a', glyph: '◆' },
  stone: { name: 'Stone', color: '#9db38a', dark: '#4c5e3d', glyph: '●' },
};

// kind: 'attack' | 'shield' | 'heal' | 'ember' | 'draw' | 'hybrid'
// value: damage / shield / heal amount. extra: secondary effect amount.
export const CARD_TYPES = [
  { id: 'cinder',   name: 'Cinder Jab',   suit: 'flame', kind: 'attack', cost: 1, value: 3, text: 'Deal 3 damage.' },
  { id: 'slash',    name: 'Ember Slash',  suit: 'flame', kind: 'attack', cost: 2, value: 5, text: 'Deal 5 damage.' },
  { id: 'inferno',  name: 'Inferno',      suit: 'flame', kind: 'attack', cost: 4, value: 9, text: 'Deal 9 damage.' },
  { id: 'sparkbolt',name: 'Sparkbolt',    suit: 'spark', kind: 'attack', cost: 3, value: 6, text: 'Deal 6 damage.', extra: 1, extraKind: 'draw', extraText: 'Draw 1 card.' },
  { id: 'guard',    name: 'Ember Guard',  suit: 'stone', kind: 'shield', cost: 1, value: 6, text: 'Gain 6 shield.' },
  { id: 'bulwark',  name: 'Bulwark',      suit: 'stone', kind: 'shield', cost: 2, value: 11, text: 'Gain 11 shield.' },
  { id: 'mend',     name: 'Warm Mend',    suit: 'frost', kind: 'heal',   cost: 2, value: 6, text: 'Restore 6 HP.' },
  { id: 'phoenix',  name: 'Phoenix Rise', suit: 'flame', kind: 'hybrid', cost: 3, value: 4, text: 'Deal 4 damage.', extra: 4, extraKind: 'heal', extraText: 'Restore 4 HP.' },
  { id: 'kindle',   name: 'Kindle',       suit: 'spark', kind: 'ember',  cost: 0, value: 2, text: 'Gain 2 ember this turn.' },
  { id: 'scry',     name: 'Scry Ashes',   suit: 'frost', kind: 'draw',   cost: 1, value: 2, text: 'Draw 2 cards.' },
  { id: 'frostbite',name: 'Frostbite',    suit: 'frost', kind: 'attack', cost: 2, value: 4, text: 'Deal 4 damage.', extra: 3, extraKind: 'shield', extraText: 'Gain 3 shield.' },
  { id: 'quake',    name: 'Stone Quake',  suit: 'stone', kind: 'attack', cost: 3, value: 7, text: 'Deal 7 damage.' },
];

export const CARD_BY_ID = Object.fromEntries(CARD_TYPES.map((c) => [c.id, c]));

// A 24-card deck: the mix is fixed, the order is shuffled per match.
export const DECK_LIST = [
  'cinder', 'cinder',
  'slash', 'slash', 'slash',
  'inferno',
  'sparkbolt', 'sparkbolt',
  'guard', 'guard', 'guard',
  'bulwark', 'bulwark',
  'mend', 'mend',
  'phoenix',
  'kindle', 'kindle', 'kindle',
  'scry', 'scry',
  'frostbite', 'frostbite',
  'quake',
];

export const HAND_LIMIT = 7;
export const START_HAND = 4;
export const DRAW_PER_TURN = 2;
export const MAX_HP = 25;
export const MAX_EMBER = 10;
export const RESONANCE_BONUS = 2;

// Build a fresh shuffled deck of card objects (each gets a unique uid).
export function buildDeck(rng) {
  const ids = DECK_LIST.slice();
  // Shuffle the ids with the seeded stream, then stamp uids in order.
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  return ids.map((id, index) => ({ uid: index + 1, ...CARD_BY_ID[id] }));
}

// Human-readable one-liner for the turn log.
export function describeCard(card) {
  const suit = SUITS[card.suit];
  return `${card.name} (${suit.name} ${card.cost} ember)`;
}
