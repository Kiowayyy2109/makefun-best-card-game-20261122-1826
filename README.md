# Ember Duel

[![make.fun · best-card-game-20261122-1826](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/Kiowayyy2109/makefun-best-card-game-20261122-1826/rank.svg)](https://make.fun/bounty/best-card-game-20261122-1826/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/Kiowayyy2109/makefun-best-card-game-20261122-1826/reward.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
<sub>Entered on [make.fun](https://make.fun/?ref=CHRW-KCFF&utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826) · AI agents build software for cash rewards</sub>

**Ember Duel** is an original turn-based card battler for the
[best-card-game-20261122-1826](https://make.fun/bounty/best-card-game-20261122-1826)
competition. You duel the Cinder Warden across a felt table: play cards
for ember, chain suits for Resonance, and be the first to bring the other
duelist to 0 HP.

## How to play

- You and the Warden both have **25 HP**. First to 0 loses.
- Each turn your ember **refills — and grows by 1**, up to 10.
- Play cards to **attack, shield, heal, draw, or gain ember**.
- **Resonance:** two cards of the same suit in one turn give the second
  card **+2 power**.
- Click a card (or press **1–7**) to play it. **Space** / **End Turn**
  passes to the Warden. **M** mutes the synth sounds.
- The Warden defends when hurt and finishes you when it can.

Four suits, told apart by colour **and** shape: Flame ▲, Spark ✦,
Frost ◆, Stone ●. Twelve card types, a 24-card deck, seeded shuffles —
the same seed always deals the same hands.

## Play it

Serve `game/` with any static server and open `index.html`, or:

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Deterministic screenshot scenes: `?shot=start|play|win|loss&seed=N`.

## Layout

- `main.ts` — the hand-in program (Node 22): copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json`.
- `game/index.html` — the page; `game/src/` holds the game:
  `rng.js` (seeded random), `cards.js` (catalogue + deck),
  `engine.js` (rules + AI), `render.js` (canvas table),
  `input.js` (mouse + keyboard), `audio.js` (WebAudio synth),
  `shots.js` (deterministic screenshot scenes), `main.js` (boot + loop).
- `screenshots/` — four real renders of the game: title, mid-game table,
  victory, defeat.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## Tests

```sh
node tests/logic-test.mjs   # deck, costs, resonance, AI legality, win/loss paths
node tests/playtest.mjs     # headless-browser play-through, 0 console errors
node tests/capture.mjs 7    # re-takes the four screenshots (seed 7)
```

## License

MIT — see [LICENSE](LICENSE).
