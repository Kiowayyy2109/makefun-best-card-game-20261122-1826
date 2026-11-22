// Ember Duel — logic unit tests (Node, no browser).
// Run: node tests/logic-test.mjs
import { createRng } from '../game/src/rng.js';
import { buildDeck, CARD_BY_ID, MAX_HP } from '../game/src/cards.js';
import {
  createMatch, beginMatch, playCard, canPlay, chooseAiCard,
  endPlayerTurn, beginNextPlayerTurn, drawCards, startAiTurn,
  PHASE_PLAYER, PHASE_WON, PHASE_LOST,
} from '../game/src/engine.js';
import { stageShot } from '../game/src/shots.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name} ${detail}`);
  }
}

function strongPolicy(match) {
  const hand = match.player.hand;
  const foe = match.foe;
  for (const card of hand) {
    if (match.player.ember < card.cost) continue;
    const amount = (card.kind === 'attack' || card.kind === 'hybrid')
      ? card.value + (match.player.playedSuits.includes(card.suit) ? 2 : 0) : 0;
    if (amount > 0 && amount >= foe.hp + foe.shield) return card;
  }
  for (const card of hand) {
    if (card.kind === 'ember' && card.cost <= match.player.ember) {
      const unlocks = hand.some((c) => c.uid !== card.uid && c.cost > match.player.ember && c.cost <= match.player.ember + card.value);
      if (unlocks) return card;
    }
  }
  let best = null;
  let bestScore = -Infinity;
  for (const card of hand) {
    if (match.player.ember < card.cost) continue;
    let score = card.value * 2 - card.cost;
    if (card.kind === 'attack' || card.kind === 'hybrid') score += 6;
    if (card.kind === 'ember') score += 8;
    if (card.kind === 'draw') score += 4;
    if (card.kind === 'heal' && match.player.hp > 24) score -= 20;
    if (card.kind === 'shield' && match.player.hp > 20) score -= 20;
    if (match.player.playedSuits.includes(card.suit)) score += 4;
    if (score > bestScore) { bestScore = score; best = card; }
  }
  return bestScore > 0 ? best : null;
}

function runAiTurn(match) {
  const foe = match.foe;
  startAiTurn(match);
  let guard = 0;
  while (guard < 12) {
    guard += 1;
    const card = chooseAiCard(match);
    if (!card) break;
    const before = foe.ember;
    const event = playCard(match, foe, card.uid);
    if (!event) { check('ai play always succeeds when chosen', false); break; }
    if (foe.ember < 0) { check('ai ember never negative', false); break; }
    // Kindle refunds ember, so account for its gain.
    if (before - event.card.cost + (event.emberGain || 0) !== foe.ember) { check('ai ember deducted by cost', false, `before=${before} cost=${event.card.cost} gain=${event.emberGain || 0} after=${foe.ember}`); break; }
    if (match.phase === PHASE_WON || match.phase === PHASE_LOST) break;
  }
  if (match.phase === 'ai') beginNextPlayerTurn(match);
}

function playFullTurn(match, policy) {
  let guard = 0;
  while (guard < 12) {
    guard += 1;
    const card = policy(match);
    if (!card) break;
    playCard(match, match.player, card.uid);
    if (match.phase === PHASE_WON || match.phase === PHASE_LOST) return;
  }
  if (match.phase !== PHASE_PLAYER) return;
  endPlayerTurn(match);
  runAiTurn(match);
}

// 1. Shuffle determinism.
{
  const a = buildDeck(createRng(42)).map((c) => c.id).join(',');
  const b = buildDeck(createRng(42)).map((c) => c.id).join(',');
  const c = buildDeck(createRng(43)).map((c) => c.id).join(',');
  check('shuffle deterministic for same seed', a === b);
  check('shuffle differs across seeds', a !== c);
  check('deck has 24 cards', buildDeck(createRng(1)).length === 24);
  const uids = new Set(buildDeck(createRng(1)).map((x) => x.uid));
  check('deck uids unique', uids.size === 24);
}

// 2. Match setup.
{
  const m = createMatch(createRng(7));
  check('player starts with 4 cards', m.player.hand.length === 4);
  check('foe starts with 4 cards', m.foe.hand.length === 4);
  check('both start at 25 HP', m.player.hp === 25 && m.foe.hp === 25);
  check('decks have 20 left', m.player.deck.length === 20 && m.foe.deck.length === 20);
  beginMatch(m);
  check('beginMatch opens player phase', m.phase === PHASE_PLAYER);
  check('player starts with 3 ember', m.player.ember === 3 && m.player.emberMax === 3);
}

// 3. Costs and legality.
{
  const m = createMatch(createRng(7));
  beginMatch(m);
  const expensive = m.player.hand.find((c) => c.cost > m.player.ember);
  if (expensive) check('unaffordable card cannot be played', canPlay(m, m.player, expensive) === false && playCard(m, m.player, expensive.uid) === null);
  else console.log('SKIP unaffordable-card test (no expensive card in hand)');
  const cheap = m.player.hand.find((c) => c.cost <= m.player.ember);
  const emberBefore = m.player.ember;
  const event = playCard(m, m.player, cheap.uid);
  check('affordable card plays', event !== null);
  check('ember deducted by cost', m.player.ember === emberBefore - cheap.cost, `ember ${m.player.ember} vs ${emberBefore - cheap.cost}`);
  check('played card leaves hand', !m.player.hand.some((c) => c.uid === cheap.uid));
  check('played card enters discard', m.player.discard.some((c) => c.uid === cheap.uid));
}

// 4. Damage and shield absorption.
{
  const m = createMatch(createRng(7));
  beginMatch(m);
  m.foe.shield = 5;
  const strike = { uid: 9001, ...CARD_BY_ID.slash };
  m.player.hand.push(strike);
  m.player.ember = 10;
  playCard(m, m.player, 9001);
  check('shield absorbs damage first', m.foe.shield === 0 && m.foe.hp === MAX_HP, `hp=${m.foe.hp} shield=${m.foe.shield}`);
  const strike2 = { uid: 9002, ...CARD_BY_ID.quake };
  m.player.hand.push(strike2);
  playCard(m, m.player, 9002);
  check('overflow damage hits HP', m.foe.hp === 18, `hp=${m.foe.hp}`);
}

// 5. Resonance: second same-suit card gets +2.
{
  const m = createMatch(createRng(7));
  beginMatch(m);
  m.player.ember = 10;
  const a = { uid: 9101, ...CARD_BY_ID.cinder };
  const b = { uid: 9102, ...CARD_BY_ID.slash };
  m.player.hand.push(a, b);
  playCard(m, m.player, 9101);
  const hpAfterFirst = m.foe.hp;
  playCard(m, m.player, 9102);
  check('resonance adds +2 damage', hpAfterFirst - m.foe.hp === 7, `dealt ${hpAfterFirst - m.foe.hp}, expected 7`);
  check('resonance note set', m.resonanceNote.includes('Resonance'));
}

// 6. Heal capped at max HP.
{
  const m = createMatch(createRng(7));
  beginMatch(m);
  m.player.hp = 24;
  m.player.ember = 10;
  const mend = { uid: 9201, ...CARD_BY_ID.mend };
  m.player.hand.push(mend);
  playCard(m, m.player, 9201);
  check('heal caps at 25 HP', m.player.hp === MAX_HP, `hp=${m.player.hp}`);
}

// 7. AI legality across a full game.
{
  let aiLegal = true;
  const m = createMatch(createRng(11));
  beginMatch(m);
  let guard = 0;
  while (m.phase === PHASE_PLAYER && guard < 80) {
    guard += 1;
    playFullTurn(m, strongPolicy);
    if (m.foe.ember < 0 || m.player.ember < 0) aiLegal = false;
  }
  check('full game runs without negative ember', aiLegal);
  check('full game ends in win or loss', m.phase === PHASE_WON || m.phase === PHASE_LOST, `phase=${m.phase} turns=${m.turn}`);
}

// 8. Win path reachable (strong policy, several seeds).
{
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = createMatch(createRng(seed));
    beginMatch(m);
    let guard = 0;
    while (m.phase === PHASE_PLAYER && guard < 60) {
      guard += 1;
      playFullTurn(m, strongPolicy);
    }
    if (m.phase === PHASE_WON) wins += 1;
  }
  check('win path reachable (strong policy wins >=1 of 5 seeds)', wins >= 1, `wins=${wins}/5`);
}

// 9. Loss path reachable (passive player never attacks).
{
  let losses = 0;
  for (const seed of [1, 2, 3]) {
    const m = createMatch(createRng(seed));
    beginMatch(m);
    let guard = 0;
    while (m.phase === PHASE_PLAYER && guard < 60) {
      guard += 1;
      playFullTurn(m, (mm) => {
        const c = mm.player.hand.find((x) => (x.kind === 'ember' || x.kind === 'draw') && x.cost <= mm.player.ember);
        return c || null;
      });
    }
    if (m.phase === PHASE_LOST) losses += 1;
  }
  check('loss path reachable (passive player loses >=1 of 3 seeds)', losses >= 1, `losses=${losses}/3`);
}

// 10. Deck exhaustion reshuffles the discard pile.
{
  const m = createMatch(createRng(7));
  beginMatch(m);
  m.player.deck = [];
  m.player.discard = [{ uid: 9301, ...CARD_BY_ID.cinder }, { uid: 9302, ...CARD_BY_ID.guard }];
  m.player.hand = [];
  const drawn = drawCards(m, m.player, 2);
  check('discard reshuffles into deck and draws', drawn === 2 && m.player.hand.length === 2, `drawn=${drawn}`);
}

// 11. Screenshot scenes stage correctly.
{
  for (const [name, want] of [['start', 'title'], ['play', 'play'], ['win', 'won'], ['loss', 'lost']]) {
    const m = createMatch(createRng(3));
    const scene = stageShot(name, m);
    check(`shot ${name} stages ${want}`, scene.screen === want, `got ${scene.screen}, phase=${m.phase}`);
  }
  // Determinism: same seed, same play scene HP.
  const m1 = createMatch(createRng(9));
  stageShot('play', m1);
  const m2 = createMatch(createRng(9));
  stageShot('play', m2);
  check('play scene deterministic', m1.player.hp === m2.player.hp && m1.foe.hp === m2.foe.hp && m1.log.join('|') === m2.log.join('|'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
