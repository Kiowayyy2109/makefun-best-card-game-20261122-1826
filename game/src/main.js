// Ember Duel — boot and the one loop.
// Screens: title → play → won / lost. The AI answers on a timer so its
// cards land one at a time, with a damage floater over the target each hit.
//
// ?seed=N fixes the shuffle. ?shot=start|play|win|loss (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { createRng } from './rng.js';
import {
  createMatch, beginMatch, playCard, chooseAiCard, endPlayerTurn,
  beginNextPlayerTurn, startAiTurn, checkEnd,
  PHASE_PLAYER, PHASE_AI, PHASE_WON, PHASE_LOST,
} from './engine.js';
import {
  createInput, ACTION_CONFIRM, ACTION_MUTE, ACTION_TITLE,
} from './input.js';
import {
  createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_WON, SCREEN_LOST,
  endTurnRect, startButtonRect, againButtonRect, handCardRect,
} from './render.js';
import { stageShot } from './shots.js';
import { sfx, playEventSound, ensureAudio, toggleMute } from './audio.js';

const BEST_KEY = 'ember-duel-best-turns';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const match = createMatch(createRng(seed));
const renderer = createRenderer(canvas);

const ui = {
  screen: SCREEN_TITLE,
  best: 0,
  hoverIndex: -1,
  hoverEndTurn: false,
  lastPlayed: null,
  lastPlayedAt: 0,
  floaters: [],
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best result then lasts this visit only.
  }
}

function announce(message) {
  status.textContent = message;
}

function addFloater(x, y, text, color) {
  ui.floaters.push({ x, y, text, color, born: performance.now() });
  if (ui.floaters.length > 12) ui.floaters.shift();
}

function floaterFor(event) {
  if (!event) return;
  const targetIsFoe = event.foe === match.foe;
  const x = targetIsFoe ? 190 : 190;
  const y = targetIsFoe ? 60 : 640;
  if (event.damage > 0) addFloater(x, y, `-${event.damage}`, '#ff5a3c');
  if (event.heal > 0) addFloater(targetIsFoe ? 640 : 190, targetIsFoe ? 60 : 640, `+${event.heal}`, '#7dff8a');
  if (event.shield > 0) addFloater(x + 120, y, `+${event.shield} 🛡`, '#6ec6ff');
}

function resolvePlay(duelist, cardUid) {
  const event = playCard(match, duelist, cardUid);
  if (!event) return null;
  ui.lastPlayed = event.card;
  ui.lastPlayedAt = performance.now();
  playEventSound(event);
  floaterFor(event);
  return event;
}

function runShot(name) {
  ui.best = readBest();
  const scene = stageShot(name, match, seed);
  ui.screen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw({ match, screen: ui.screen, best: ui.best, hoverIndex: -1, hoverEndTurn: false, lastPlayed: null, floaters: [] });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  ui.best = readBest();
  let screen = SCREEN_TITLE;
  let aiTimer = 0; // ms until the AI's next card
  let aiStarted = false;

  function startDuel() {
    const fresh = createMatch(createRng(Math.floor(Math.random() * 4294967296)));
    match.rng = fresh.rng;
    match.player = fresh.player;
    match.foe = fresh.foe;
    match.turn = fresh.turn;
    match.log = fresh.log;
    match.phase = fresh.phase;
    match.winner = null;
    beginMatch(match);
    screen = SCREEN_PLAY;
    aiStarted = false;
    ui.lastPlayed = null;
    ui.floaters = [];
    sfx.deal();
    announce('Playing. Your turn — play a card or end the turn.');
  }

  function finishDuel() {
    screen = match.phase === PHASE_WON ? SCREEN_WON : SCREEN_LOST;
    if (match.phase === PHASE_WON) {
      sfx.win();
      if (ui.best === 0 || match.turn < ui.best) {
        ui.best = match.turn;
        saveBest(ui.best);
      }
      announce(`Victory in ${match.turn} turns!`);
    } else {
      sfx.lose();
      announce('Defeat. The Cinder Warden wins this duel.');
    }
  }

  function beginAiTurn() {
    startAiTurn(match);
    aiStarted = true;
    aiTimer = 650;
    announce('The Warden is thinking…');
  }

  function aiStep() {
    if (match.phase !== PHASE_AI) return;
    const card = chooseAiCard(match);
    if (!card) {
      beginNextPlayerTurn(match);
      sfx.turn();
      announce(`Turn ${match.turn}. Your move.`);
      return;
    }
    resolvePlay(match.foe, card.uid);
    if (match.phase === PHASE_WON || match.phase === PHASE_LOST) {
      finishDuel();
      return;
    }
    aiTimer = 750;
  }

  function endTurn() {
    if (match.phase !== PHASE_PLAYER) return;
    if (!endPlayerTurn(match)) return;
    sfx.turn();
    beginAiTurn();
    announce('The Warden answers…');
  }

  function handleClick(point) {
    if (!point) return;
    ensureAudio();
    if (screen === SCREEN_TITLE) {
      if (renderer.pointInRect(point, startButtonRect())) startDuel();
      return;
    }
    if (screen === SCREEN_WON || screen === SCREEN_LOST) {
      if (renderer.pointInRect(point, againButtonRect())) startDuel();
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (renderer.pointInRect(point, endTurnRect())) {
      endTurn();
      return;
    }
    const index = renderer.hitHandCard(point, match.player.hand.length, ui.hoverIndex);
    if (index >= 0) {
      const card = match.player.hand[index];
      if (match.phase === PHASE_PLAYER && match.player.ember >= card.cost) {
        resolvePlay(match.player, card.uid);
        if (match.phase === PHASE_WON || match.phase === PHASE_LOST) finishDuel();
      } else {
        sfx.click();
        announce(`Not enough ember for ${card.name}.`);
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_TITLE) {
      screen = SCREEN_TITLE;
      match.phase = 'title';
      announce('Ember Duel. Press Space or click to start.');
      return;
    }
    if (actions & ACTION_CONFIRM) {
      ensureAudio();
      if (screen === SCREEN_TITLE) startDuel();
      else if (screen === SCREEN_WON || screen === SCREEN_LOST) startDuel();
      else if (screen === SCREEN_PLAY) endTurn();
    }
    const numberKey = input.takeNumberKey();
    if (numberKey >= 1 && numberKey <= match.player.hand.length && screen === SCREEN_PLAY) {
      const card = match.player.hand[numberKey - 1];
      if (match.phase === PHASE_PLAYER && match.player.ember >= card.cost) {
        resolvePlay(match.player, card.uid);
        if (match.phase === PHASE_WON || match.phase === PHASE_LOST) finishDuel();
      }
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min(100, now - last);
    last = now;

    handleActions();
    handleClick(input.takeClick());

    // Hover tracking for card lift and the End Turn glow.
    const hover = input.hover();
    const scaleX = 1280 / canvas.getBoundingClientRect().width;
    const scaleY = 720 / canvas.getBoundingClientRect().height;
    const logical = { x: hover.x * scaleX, y: hover.y * scaleY };
    ui.hoverIndex = screen === SCREEN_PLAY
      ? renderer.hitHandCard(logical, match.player.hand.length, -1) : -1;
    ui.hoverEndTurn = screen === SCREEN_PLAY && renderer.pointInRect(logical, endTurnRect());

    // AI pacing: one card roughly every 750 ms.
    if (screen === SCREEN_PLAY && match.phase === PHASE_AI) {
      if (!aiStarted) beginAiTurn();
      else {
        aiTimer -= delta;
        if (aiTimer <= 0) aiStep();
      }
    }

    // The spotlight card fades after a few seconds.
    if (ui.lastPlayed && now - ui.lastPlayedAt > 4000) ui.lastPlayed = null;

    renderer.draw({
      match,
      screen,
      best: ui.best,
      hoverIndex: ui.hoverIndex,
      hoverEndTurn: ui.hoverEndTurn,
      lastPlayed: ui.lastPlayed,
      floaters: ui.floaters,
    });
  }

  announce('Ember Duel. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
