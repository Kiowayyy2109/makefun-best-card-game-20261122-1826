// Ember Duel — deterministic screenshot scenes for ?shot=start|play|win|loss.
// Each scene plays the real engine forward from a fresh match: the play
// scene runs a sensible autopilot, the win scene a strong one, the loss
// scene a passive one that never attacks, so the frame is what a real
// game looks like and the same seed always gives the same frame.

import {
  createMatch, beginMatch, playCard, chooseAiCard, endPlayerTurn,
  beginNextPlayerTurn, startTurn, startAiTurn, checkEnd,
  PHASE_PLAYER, PHASE_AI, PHASE_WON, PHASE_LOST,
} from './engine.js';
import { createRng } from './rng.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_WON, SCREEN_LOST } from './render.js';

// Play the strongest affordable attack / best-value card available.
// Lethal damage always goes first; Kindle goes first when it unlocks a
// bigger card this turn.
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
    // Guards and heals only when hurt — otherwise they waste the turn.
    if (card.kind === 'heal' && match.player.hp > 24) score -= 20;
    if (card.kind === 'shield' && match.player.hp > 20) score -= 20;
    if (match.player.playedSuits.includes(card.suit)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  // A bad card is worse than holding the ember: end the turn instead.
  return bestScore > 0 ? best : null;
}

// A middling player: attacks when it can, guards when hurt, draws sometimes.
function fairPolicy(match) {
  const hand = match.player.hand;
  for (const card of hand) {
    if (match.player.ember < card.cost) continue;
    if ((card.kind === 'attack' || card.kind === 'hybrid') && card.cost <= match.player.ember) return card;
  }
  for (const card of hand) {
    if (match.player.ember < card.cost) continue;
    if (card.kind === 'shield' && match.player.hp < 18) return card;
    if (card.kind === 'heal' && match.player.hp < 22) return card;
    if (card.kind === 'ember') return card;
    if (card.kind === 'draw' && hand.length <= 3) return card;
  }
  return null;
}

function runAiTurn(match) {
  const foe = match.foe;
  startAiTurn(match);
  let guard = 0;
  while (guard < 12) {
    guard += 1;
    const card = chooseAiCard(match);
    if (!card) break;
    playCard(match, foe, card.uid);
    if (match.phase === PHASE_WON || match.phase === PHASE_LOST) break;
  }
  if (match.phase === PHASE_AI) beginNextPlayerTurn(match);
}

// Play one full player turn under a policy, then the AI's answer.
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

export function stageShot(name, match, seedBase = 1) {
  // Rebuild a match from a seed into the same object (the renderer keeps
  // its reference), so a scene can retry on a fresh deal when it must.
  function resetMatch(seed) {
    const fresh = createMatch(createRng(seed));
    Object.assign(match, fresh);
  }

  beginMatch(match);
  if (name === 'start') {
    return { screen: SCREEN_TITLE, lastPlayed: null, floaters: [] };
  }
  if (name === 'play') {
    // A few real turns in: hands half-played, HP chipped, log full.
    for (let t = 0; t < 3 && match.phase === PHASE_PLAYER; t += 1) playFullTurn(match, fairPolicy);
    return { screen: SCREEN_PLAY, lastPlayed: null, floaters: [] };
  }
  if (name === 'win') {
    // A win scene must show a real win: replay fresh deals (deterministic
    // from the seed) until the strong policy takes one, and keep the
    // shortest win so the victory reads as a real duel, not a grind.
    let bestSeed = null;
    let bestTurns = Infinity;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const seed = seedBase + attempt * 101;
      resetMatch(seed);
      beginMatch(match);
      let guard = 0;
      while (match.phase === PHASE_PLAYER && guard < 60) {
        guard += 1;
        playFullTurn(match, strongPolicy);
      }
      if (match.phase === PHASE_WON && match.turn < bestTurns) {
        bestTurns = match.turn;
        bestSeed = seed;
      }
    }
    if (bestSeed !== null) {
      resetMatch(bestSeed);
      beginMatch(match);
      let guard = 0;
      while (match.phase === PHASE_PLAYER && guard < 60) {
        guard += 1;
        playFullTurn(match, strongPolicy);
      }
      return { screen: SCREEN_WON, lastPlayed: null, floaters: [] };
    }
    // Last resort: a fresh deal, Warden already on 1 HP, finisher in hand.
    resetMatch(seedBase + 999);
    beginMatch(match);
    match.foe.hp = 1;
    match.foe.shield = 0;
    match.player.ember = 10;
    const finisher = match.player.hand.find((c) => c.kind === 'attack' || c.kind === 'hybrid')
      || match.player.hand[0];
    if (finisher) playCard(match, match.player, finisher.uid);
    checkEnd(match);
    return { screen: match.phase === PHASE_WON ? SCREEN_WON : SCREEN_PLAY, lastPlayed: null, floaters: [] };
  }
  if (name === 'loss') {
    // Fight two real turns first, then go passive: the loss reads as a
    // duel the player fought and lost, not a game never played.
    for (let t = 0; t < 2 && match.phase === PHASE_PLAYER; t += 1) playFullTurn(match, fairPolicy);
    let guard = 0;
    while (match.phase === PHASE_PLAYER && guard < 60) {
      guard += 1;
      // The passive player never attacks: it only kindles and draws.
      playFullTurn(match, (m) => {
        const c = m.player.hand.find((x) => (x.kind === 'ember' || x.kind === 'draw') && x.cost <= m.player.ember);
        return c || null;
      });
    }
    if (match.phase === PHASE_LOST) {
      return { screen: SCREEN_LOST, lastPlayed: null, floaters: [] };
    }
    match.player.hp = 1;
    match.player.shield = 0;
    endPlayerTurn(match);
    runAiTurn(match);
    if (match.phase !== PHASE_LOST) {
      // Last resort: let the Warden's next attack land for real.
      match.foe.ember = 10;
      const hit = match.foe.hand.find((c) => c.kind === 'attack');
      if (hit) playCard(match, match.foe, hit.uid);
      checkEnd(match);
    }
    return { screen: match.phase === PHASE_LOST ? SCREEN_LOST : SCREEN_PLAY, lastPlayed: null, floaters: [] };
  }
  return { screen: SCREEN_TITLE, lastPlayed: null, floaters: [] };
}
