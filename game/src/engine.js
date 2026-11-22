// Ember Duel — the rules engine. Pure logic: no DOM, no canvas, no audio.
// Two duelists, 25 HP each. Ember pays for cards; it refills each turn and
// the refill grows by 1 (up to 10). Shield absorbs damage first. Resonance:
// a second card of the same suit in one turn gains +2 damage or healing.

import {
  buildDeck, HAND_LIMIT, START_HAND, DRAW_PER_TURN,
  MAX_HP, MAX_EMBER, RESONANCE_BONUS, SUITS,
} from './cards.js';

export const PHASE_TITLE = 'title';
export const PHASE_PLAYER = 'player';
export const PHASE_AI = 'ai';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

export function createDuelist(name, isAi) {
  return {
    name, isAi,
    hp: MAX_HP, shield: 0,
    ember: 0, emberMax: 3,
    deck: [], hand: [], discard: [],
    playedSuits: [], // suits played this turn, for resonance
    damageDealt: 0, cardsPlayed: 0,
  };
}

// A fresh match. Both decks are shuffled from the same seeded stream.
export function createMatch(rng) {
  const player = createDuelist('You', false);
  const foe = createDuelist('Cinder Warden', true);
  player.deck = buildDeck(rng);
  foe.deck = buildDeck(rng);
  const match = {
    rng,
    player, foe,
    turn: 1,
    phase: PHASE_TITLE,
    log: [],
    winner: null,
    resonanceNote: '',
  };
  drawCards(match, player, START_HAND);
  drawCards(match, foe, START_HAND);
  return match;
}

export function logLine(match, text) {
  match.log.push(text);
  if (match.log.length > 40) match.log.shift();
}

export function drawCards(match, duelist, count) {
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    if (duelist.hand.length >= HAND_LIMIT) break;
    if (duelist.deck.length === 0) {
      if (duelist.discard.length === 0) break;
      duelist.deck = duelist.discard;
      duelist.discard = [];
      // Reshuffle the discard pile with the same stream.
      for (let j = duelist.deck.length - 1; j > 0; j -= 1) {
        const k = Math.floor(match.rng() * (j + 1));
        const tmp = duelist.deck[j];
        duelist.deck[j] = duelist.deck[k];
        duelist.deck[k] = tmp;
      }
      logLine(match, `${duelist.name} reshuffles the discard pile.`);
    }
    duelist.hand.push(duelist.deck.pop());
    drawn += 1;
  }
  return drawn;
}

// Open a turn for a duelist: refill ember (max grows), draw, clear suits.
export function startTurn(match, duelist) {
  duelist.emberMax = Math.min(MAX_EMBER, duelist.emberMax + (match.turn === 1 && duelist === match.player ? 0 : 1));
  duelist.ember = duelist.emberMax;
  duelist.playedSuits = [];
  if (!(match.turn === 1 && duelist === match.player)) drawCards(match, duelist, DRAW_PER_TURN);
  match.resonanceNote = '';
}

export function beginMatch(match) {
  match.phase = PHASE_PLAYER;
  match.turn = 1;
  match.player.emberMax = 3;
  match.player.ember = 3;
  match.player.playedSuits = [];
  logLine(match, 'The duel begins. Your move — play cards, then End Turn.');
}

export function canPlay(match, duelist, card) {
  if (match.phase === PHASE_WON || match.phase === PHASE_LOST) return false;
  if (duelist.ember < card.cost) return false;
  return duelist.hand.some((c) => c.uid === card.uid);
}

function applyDamage(match, target, amount, sourceName) {
  let remaining = amount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp = Math.max(0, target.hp - remaining);
  return { absorbed: amount - remaining, dealt: remaining, sourceName };
}

// Resolve one card. Returns an event describing what happened (for
// animation and sound) or null when the card cannot be played.
export function playCard(match, duelist, cardUid) {
  const handIndex = duelist.hand.findIndex((c) => c.uid === cardUid);
  if (handIndex < 0) return null;
  const card = duelist.hand[handIndex];
  if (duelist.ember < card.cost) return null;
  const foe = duelist === match.player ? match.foe : match.player;
  const resonant = duelist.playedSuits.includes(card.suit);
  const bonus = resonant ? RESONANCE_BONUS : 0;
  duelist.ember -= card.cost;
  duelist.hand.splice(handIndex, 1);
  duelist.discard.push(card);
  duelist.playedSuits.push(card.suit);
  duelist.cardsPlayed += 1;

  const event = { card, duelist, foe, bonus, resonant, damage: 0, heal: 0, shield: 0, emberGain: 0, drawn: 0 };
  const suitName = SUITS[card.suit].name;
  let line = `${duelist.name} plays ${card.name} (${suitName})`;
  if (resonant) line += ` — Resonance +${RESONANCE_BONUS}!`;

  if (card.kind === 'attack' || card.kind === 'hybrid') {
    const amount = card.value + bonus;
    const hit = applyDamage(match, foe, amount, duelist.name);
    event.damage = amount;
    duelist.damageDealt += hit.dealt;
    line += `, hits ${foe.name} for ${amount}`;
    if (hit.absorbed > 0) line += ` (${hit.absorbed} absorbed)`;
    line += '.';
  }
  if (card.kind === 'shield') {
    duelist.shield += card.value + bonus;
    event.shield = card.value + bonus;
    line += `, gains ${event.shield} shield.`;
  }
  if (card.kind === 'heal') {
    const healed = Math.min(MAX_HP - duelist.hp, card.value + bonus);
    duelist.hp += healed;
    event.heal = healed;
    line += `, restores ${healed} HP.`;
  }
  if (card.kind === 'hybrid') {
    const healed = Math.min(MAX_HP - duelist.hp, card.extra);
    duelist.hp += healed;
    event.heal = healed;
    line += ` Restores ${healed} HP.`;
  }
  if (card.kind === 'ember') {
    duelist.ember += card.value;
    event.emberGain = card.value;
    line += `, gains ${card.value} ember.`;
  }
  if (card.kind === 'draw') {
    event.drawn = drawCards(match, duelist, card.value);
    line += `, draws ${event.drawn}.`;
  }
  // Secondary effect on sparkbolt / frostbite (attack cards with an extra).
  // Hybrid cards already applied their extra above; they skip this block.
  if (card.kind !== 'hybrid' && card.extraKind === 'draw') {
    event.drawn = drawCards(match, duelist, card.extra);
    line += ` Draws ${event.drawn}.`;
  }
  if (card.kind !== 'hybrid' && card.extraKind === 'shield') {
    duelist.shield += card.extra;
    event.shield += card.extra;
    line += ` Gains ${card.extra} shield.`;
  }
  if (card.kind !== 'hybrid' && card.extraKind === 'heal') {
    const healed = Math.min(MAX_HP - duelist.hp, card.extra);
    duelist.hp += healed;
    event.heal += healed;
  }
  logLine(match, line);
  if (resonant) match.resonanceNote = `Resonance! ${suitName} +${RESONANCE_BONUS}`;
  checkEnd(match);
  return event;
}

export function checkEnd(match) {
  if (match.foe.hp <= 0 && match.player.hp <= 0) {
    match.phase = match.player.damageDealt >= match.foe.damageDealt ? PHASE_WON : PHASE_LOST;
    match.winner = match.phase === PHASE_WON ? match.player : match.foe;
    logLine(match, 'Both duelists fall — the greater damage wins.');
  } else if (match.foe.hp <= 0) {
    match.phase = PHASE_WON;
    match.winner = match.player;
    logLine(match, 'Victory! The Cinder Warden is defeated.');
  } else if (match.player.hp <= 0) {
    match.phase = PHASE_LOST;
    match.winner = match.foe;
    logLine(match, 'Defeat. The Cinder Warden stands over the embers.');
  }
  return match.phase;
}

// --- The AI opponent -------------------------------------------------------
// Scores every affordable card in hand and plays the best one, repeating
// until nothing worth playing remains. It defends when hurt, finishes when
// it can kill, and never spends ember on a heal at full health.
export function scoreAiCard(match, ai, card) {
  const foe = match.player;
  const resonant = ai.playedSuits.includes(card.suit);
  const bonus = resonant ? RESONANCE_BONUS : 0;
  let score = 0;
  if (card.kind === 'attack' || card.kind === 'hybrid') {
    const amount = card.value + bonus;
    const lethal = amount >= foe.hp + foe.shield;
    score += amount * 2 + (lethal ? 100 : 0);
    if (card.extraKind === 'heal') score += 3;
  }
  if (card.kind === 'shield') {
    // The Warden guards when hurt or threatened, not at full health:
    // a shield played at 25 HP just walls the game off.
    const threatened = foe.hand.some((c) => c.kind === 'attack' && c.value >= 5);
    if (ai.hp > 20 && !threatened) return -1;
    const urgency = ai.hp <= 12 ? 14 : ai.hp <= 18 ? 8 : 4;
    score += urgency + (card.value + bonus) * 0.8 + (threatened ? 3 : 0);
  }
  if (card.kind === 'heal') {
    if (ai.hp >= 25) return -1; // no topping off near full health
    score += (MAX_HP - ai.hp) * 0.9 + (card.value + bonus);
  }
  if (card.kind === 'ember') {
    const bigPlay = ai.hand.some((c) => c.cost >= 3 && c.uid !== card.uid && c.cost > ai.ember);
    score += bigPlay ? 12 : 2;
  }
  if (card.kind === 'draw') score += ai.hand.length <= 3 ? 10 : 3;
  // Prefer cheap cards late in the turn so nothing is wasted.
  score -= card.cost * 0.4;
  return score;
}

// One AI decision: the best affordable card, or null to end the turn.
export function chooseAiCard(match) {
  const ai = match.foe;
  let best = null;
  let bestScore = 4; // below this, the AI holds its ember and ends the turn
  for (const card of ai.hand) {
    if (ai.ember < card.cost) continue;
    const score = scoreAiCard(match, ai, card);
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

// Open the AI's turn: ember grows by 1 from the second round on (the first
// round both sides open on 3, so neither bursts first), then it draws two.
export function startAiTurn(match) {
  const ai = match.foe;
  if (match.turn > 1) ai.emberMax = Math.min(MAX_EMBER, ai.emberMax + 1);
  ai.ember = ai.emberMax;
  ai.playedSuits = [];
  drawCards(match, ai, DRAW_PER_TURN);
}

// End the player's turn: hand over to the AI, then back to the player.
export function endPlayerTurn(match) {
  if (match.phase !== PHASE_PLAYER) return false;
  match.phase = PHASE_AI;
  logLine(match, `— Turn ${match.turn}: the Warden answers —`);
  return true;
}

export function beginNextPlayerTurn(match) {
  match.turn += 1;
  match.foe.ember = 0;
  startTurn(match, match.player);
  match.phase = PHASE_PLAYER;
  logLine(match, `— Turn ${match.turn}: your move —`);
}
