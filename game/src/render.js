// Ember Duel — canvas renderer. One 1280x720 table, drawn fresh each frame:
// green felt, ember glow, fanned hands, HP bars, ember pips, turn log and
// title / win / loss overlays. All art is drawn shapes — no image files.

import { SUITS, MAX_HP } from './cards.js';
import { PHASE_TITLE, PHASE_WON, PHASE_LOST } from './engine.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WON = 'won';
export const SCREEN_LOST = 'lost';

export const CARD_W = 138;
export const CARD_H = 192;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Where the player's hand sits, fanned slightly, centred on the table.
export function handCardRect(index, count) {
  const gap = Math.min(150, (VIEW_W - 320) / Math.max(1, count));
  const total = gap * (count - 1) + CARD_W;
  const x = (VIEW_W - total) / 2 + index * gap;
  const arc = (index - (count - 1) / 2) * 7; // gentle fan curve
  return { x, y: 500 - Math.abs(index - (count - 1) / 2) * 4 + arc * 0, w: CARD_W, h: CARD_H, lift: arc };
}

// Opponent's face-down hand, small, across the top.
export function foeCardRect(index, count) {
  const w = 64;
  const h = 90;
  const gap = 72;
  const total = gap * (count - 1) + w;
  const x = (VIEW_W - total) / 2 + index * gap;
  return { x, y: 96, w, h };
}

export function endTurnRect() {
  return { x: 1090, y: 600, w: 160, h: 52 };
}

export function startButtonRect() {
  return { x: 540, y: 520, w: 200, h: 60 };
}

export function againButtonRect() {
  return { x: 540, y: 540, w: 200, h: 60 };
}

function pointInRect(point, rect) {
  return point && point.x >= rect.x && point.x <= rect.x + rect.w
    && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function hitHandCard(point, count, hoverIndex) {
  if (!point) return -1;
  // Check from the topmost (last drawn, rightmost) card backwards so
  // overlapping cards pick the one on top.
  for (let i = count - 1; i >= 0; i -= 1) {
    const r = handCardRect(i, count);
    const lift = i === hoverIndex ? -18 : 0;
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y + lift && point.y <= r.y + r.h + lift) return i;
  }
  return -1;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  function drawTable() {
    // Deep green felt with a warm ember vignette.
    const felt = ctx.createRadialGradient(640, 330, 80, 640, 360, 760);
    felt.addColorStop(0, '#2c6b4a');
    felt.addColorStop(0.6, '#1d4a32');
    felt.addColorStop(1, '#0e2418');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Table edge lines.
    ctx.strokeStyle = 'rgba(255, 197, 61, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(640, 360, 560, 290, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(640, 360, 520, 258, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Drifting ember dots for mood.
    ctx.fillStyle = 'rgba(255, 150, 60, 0.25)';
    const dots = [[120, 90], [1150, 130], [200, 620], [1080, 600], [640, 60], [60, 360], [1220, 360]];
    for (const [x, y] of dots) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHpBar(x, y, w, label, hp, shield, alignRight) {
    ctx.font = 'bold 17px Georgia, serif';
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.fillStyle = '#f5e9c8';
    ctx.fillText(label, alignRight ? x + w : x, y - 8);
    ctx.fillStyle = '#101010';
    roundRect(ctx, x, y, w, 22, 11);
    ctx.fill();
    const frac = Math.max(0, hp / MAX_HP);
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#ff5a3c');
    grad.addColorStop(1, '#ffb03d');
    ctx.fillStyle = grad;
    if (frac > 0) {
      roundRect(ctx, x + 2, y + 2, Math.max(8, (w - 4) * frac), 18, 9);
      ctx.fill();
    }
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${hp} / ${MAX_HP}${shield > 0 ? `  🛡 ${shield}` : ''}`, x + w / 2, y + 17);
    ctx.textAlign = 'left';
  }

  function drawEmberPips(x, y, ember, emberMax, label) {
    ctx.font = 'bold 15px Georgia, serif';
    ctx.fillStyle = '#ffd98a';
    ctx.fillText(label, x, y - 8);
    for (let i = 0; i < emberMax; i += 1) {
      const cx = x + 12 + i * 26;
      const cy = y + 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      if (i < ember) {
        const g = ctx.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 11);
        g.addColorStop(0, '#ffe9a8');
        g.addColorStop(0.5, '#ff9a2e');
        g.addColorStop(1, '#c33d00');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = '#2a2a2a';
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 220, 140, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (i < ember) {
        ctx.fillStyle = '#fff3c4';
        ctx.font = 'bold 11px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('◆', cx, cy + 4);
        ctx.textAlign = 'left';
      }
    }
  }

  function drawCardBack(x, y, w, h) {
    ctx.fillStyle = '#3a1c10';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = '#ff9a2e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff6b35';
    ctx.font = `bold ${Math.floor(h / 3)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('▲', x + w / 2, y + h / 2 + h / 8);
    ctx.textAlign = 'left';
  }

  function drawCard(card, x, y, opts = {}) {
    const { hover = false, playable = true, dim = false, small = false } = opts;
    const suit = SUITS[card.suit];
    const w = small ? 92 : CARD_W;
    const h = small ? 128 : CARD_H;
    const lift = hover ? -18 : 0;
    const top = y + lift;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.55;
    ctx.shadowColor = hover ? suit.color : 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = hover ? 22 : 10;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#fdf6e3';
    roundRect(ctx, x, top, w, h, 10);
    ctx.fill();
    ctx.restore();
    ctx.save();
    if (dim) ctx.globalAlpha = 0.55;
    // Suit colour band.
    ctx.fillStyle = suit.color;
    roundRect(ctx, x, top, w, small ? 30 : 40, 10);
    ctx.fill();
    ctx.fillRect(x, top + (small ? 20 : 30), w, 10);
    // Cost gem.
    ctx.beginPath();
    ctx.arc(x + 20, top + 20, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#7a2d00';
    ctx.fill();
    ctx.strokeStyle = '#ffd98a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 17px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(card.cost), x + 20, top + 26);
    // Suit glyph + name.
    ctx.fillStyle = suit.dark;
    ctx.font = `bold ${small ? 26 : 34}px Georgia, serif`;
    ctx.fillText(suit.glyph, x + w / 2, top + (small ? 62 : 82));
    ctx.fillStyle = '#2b2118';
    ctx.font = `bold ${small ? 11 : 15}px Georgia, serif`;
    ctx.fillText(card.name, x + w / 2, top + (small ? 84 : 108));
    ctx.textAlign = 'left';
    // Effect text.
    ctx.fillStyle = '#4a3b2a';
    ctx.font = `${small ? 10 : 12}px Georgia, serif`;
    const lines = wrapText(ctx, card.text, w - 18);
    lines.forEach((line, i) => {
      ctx.fillText(line, x + 9, top + (small ? 102 : 132) + i * 14);
    });
    if (card.extraText) {
      ctx.fillStyle = '#7a5a1d';
      ctx.font = `italic ${small ? 10 : 12}px Georgia, serif`;
      const extra = wrapText(ctx, card.extraText, w - 18);
      extra.forEach((line, i) => {
        ctx.fillText(line, x + 9, top + (small ? 102 : 132) + (lines.length + i) * 14);
      });
    }
    // Kind label.
    ctx.fillStyle = suit.color;
    ctx.font = `bold ${small ? 9 : 11}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(card.kind.toUpperCase(), x + w / 2, top + h - 8);
    ctx.textAlign = 'left';
    if (!playable) {
      ctx.fillStyle = 'rgba(20, 20, 20, 0.35)';
      roundRect(ctx, x, top, w, h, 10);
      ctx.fill();
    }
    if (hover && playable) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      roundRect(ctx, x - 2, top - 2, w + 4, h + 4, 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLog(log, x, y, w, h) {
    ctx.fillStyle = 'rgba(8, 16, 10, 0.72)';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 197, 61, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffd98a';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.fillText('— DUEL LOG —', x + 12, y + 22);
    ctx.font = '12px Georgia, serif';
    ctx.fillStyle = '#e8dcc0';
    const lines = log.slice(-8);
    lines.forEach((line, i) => {
      const wrapped = wrapText(ctx, line, w - 24);
      ctx.fillText(wrapped[0] ?? '', x + 12, y + 44 + i * 26);
      if (wrapped[1]) ctx.fillText(wrapped[1], x + 12, y + 58 + i * 26);
    });
  }

  function drawButton(rect, label, enabled, hover) {
    ctx.fillStyle = enabled ? (hover ? '#ff8c2e' : '#e06a00') : '#555555';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = enabled ? '#ffd98a' : '#888888';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 7);
    ctx.textAlign = 'left';
  }

  function drawTitle(match, best) {
    drawTable();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9a2e';
    ctx.font = 'bold 84px Georgia, serif';
    ctx.shadowColor = 'rgba(255, 90, 0, 0.8)';
    ctx.shadowBlur = 30;
    ctx.fillText('EMBER DUEL', 640, 150);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f5e9c8';
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText('A turn-based card battler of fire, frost and stone', 640, 192);
    // Rules card.
    ctx.fillStyle = 'rgba(8, 16, 10, 0.78)';
    roundRect(ctx, 330, 230, 620, 260, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 197, 61, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText('HOW TO PLAY', 640, 262);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = '16px Georgia, serif';
    const rules = [
      'You and the Cinder Warden both have 25 HP. First to 0 loses.',
      'Each turn your ember refills — and grows by 1, up to 10.',
      'Play cards to attack, shield, heal, draw or gain ember.',
      'Resonance: two cards of the same suit in one turn: +2 power.',
      'Click a card (or press 1–7) to play it. End Turn passes to the Warden.',
      'The Warden defends when hurt and finishes you when it can.',
    ];
    rules.forEach((line, i) => ctx.fillText(line, 640, 292 + i * 28));
    ctx.textAlign = 'left';
    drawButton(startButtonRect(), '▶  START DUEL', true, false);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbbf9a';
    ctx.font = '14px Georgia, serif';
    ctx.fillText('Click Start, press Space, or press Enter  •  M mutes sound', 640, 620);
    if (best > 0) ctx.fillText(`Best result: won in ${best} turns`, 640, 646);
    ctx.textAlign = 'left';
  }

  function drawEndOverlay(match, won) {
    ctx.fillStyle = won ? 'rgba(20, 60, 20, 0.88)' : 'rgba(60, 10, 10, 0.88)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // A solid panel behind the verdict so no table text shows through.
    ctx.fillStyle = won ? 'rgba(10, 40, 16, 0.92)' : 'rgba(40, 8, 8, 0.92)';
    roundRect(ctx, 220, 150, 840, 320, 16);
    ctx.fill();
    ctx.strokeStyle = won ? 'rgba(255, 215, 0, 0.6)' : 'rgba(255, 107, 94, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? '#ffd700' : '#ff6b5e';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.shadowColor = won ? 'rgba(255, 215, 0, 0.8)' : 'rgba(255, 60, 40, 0.8)';
    ctx.shadowBlur = 26;
    ctx.fillText(won ? '★ VICTORY ★' : 'DEFEAT', 640, 240);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f5e9c8';
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText(
      won ? 'The Cinder Warden crumbles to cold ash. The embers are yours.'
        : 'The Cinder Warden stands over the embers. Duel again?',
      640, 290,
    );
    const m = match;
    ctx.font = '19px Georgia, serif';
    ctx.fillText(`Turns played: ${m.turn}    •    Damage you dealt: ${m.player.damageDealt}    •    Cards you played: ${m.player.cardsPlayed}`, 640, 350);
    ctx.fillText(`Your HP: ${m.player.hp} / ${MAX_HP}    •    Warden HP: ${m.foe.hp} / ${MAX_HP}`, 640, 384);
    ctx.fillText(won ? 'Score: a win in the Ember Duel — claim the table.' : 'Tip: guard when low, and chain one suit for Resonance +2.', 640, 430);
    ctx.textAlign = 'left';
    drawButton(againButtonRect(), 'DUEL AGAIN', true, false);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbbf9a';
    ctx.font = '14px Georgia, serif';
    ctx.fillText('Press Space or Enter to duel again', 640, 630);
    ctx.textAlign = 'left';
  }

  function drawFloaters(floaters) {
    for (const f of floaters) {
      const age = (performance.now() - f.born) / 900;
      if (age >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.font = 'bold 30px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, f.x, f.y - age * 60);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  function drawPlay(match, ui) {
    drawTable();
    const { player, foe } = match;
    // Opponent row.
    drawHpBar(40, 24, 300, 'CINDER WARDEN', foe.hp, foe.shield, false);
    drawEmberPips(380, 24, foe.ember, foe.emberMax, 'Warden ember');
    ctx.fillStyle = '#f5e9c8';
    ctx.font = 'bold 16px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Turn ${match.turn}`, 1240, 40);
    ctx.textAlign = 'left';
    foe.hand.forEach((_, i) => {
      const r = foeCardRect(i, foe.hand.length);
      drawCardBack(r.x, r.y, r.w, r.h);
    });
    ctx.fillStyle = '#cbbf9a';
    ctx.font = '13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${foe.hand.length} cards  •  ${foe.deck.length} in deck`, 640, 200);
    ctx.textAlign = 'left';

    // Centre: the most recent card, spotlighted mid-table; otherwise the
    // turn banner telling the player whose move it is.
    if (ui.lastPlayed) {
      drawCard(ui.lastPlayed, 571, 216, { small: false });
    } else {
      ctx.fillStyle = 'rgba(8, 16, 10, 0.55)';
      roundRect(ctx, 480, 216, 320, 120, 12);
      ctx.fill();
      ctx.fillStyle = '#ffd98a';
      ctx.font = 'bold 18px Georgia, serif';
      ctx.textAlign = 'center';
      const banner = match.phase === 'player' ? 'YOUR TURN' : match.phase === 'ai' ? 'WARDEN THINKING…' : 'DUEL';
      ctx.fillText(banner, 640, 246);
      ctx.fillStyle = '#e8dcc0';
      ctx.font = '15px Georgia, serif';
      ctx.fillText(
        match.phase === 'player'
          ? 'Play cards, then End Turn.'
          : 'The Warden plays its cards…',
        640, 274,
      );
      if (match.resonanceNote) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 16px Georgia, serif';
        ctx.fillText(match.resonanceNote, 640, 306);
      }
      ctx.textAlign = 'left';
    }

    // Duel log on the right.
    drawLog(match.log, 1010, 220, 250, 260);

    // Player row.
    drawHpBar(40, 668, 300, 'YOU  —  Panji', player.hp, player.shield, false);
    drawEmberPips(950, 668, player.ember, player.emberMax, 'Your ember');
    ctx.fillStyle = '#cbbf9a';
    ctx.font = '13px Georgia, serif';
    ctx.fillText(`${player.deck.length} cards left in deck`, 640, 700);

    // Player hand.
    player.hand.forEach((card, i) => {
      const r = handCardRect(i, player.hand.length);
      const hover = ui.hoverIndex === i;
      drawCard(card, r.x, r.y, {
        hover,
        playable: match.phase === 'player' && player.ember >= card.cost,
      });
    });

    // End Turn button.
    const endRect = endTurnRect();
    drawButton(endRect, 'END TURN', match.phase === 'player', ui.hoverEndTurn);

    // Keyboard hint.
    ctx.fillStyle = '#cbbf9a';
    ctx.font = '13px Georgia, serif';
    ctx.fillText('Keys 1–7 play a card  •  Space ends turn  •  M mute', 40, 640);

    drawFloaters(ui.floaters);
  }

  // state: { match, screen, best, hoverIndex, hoverEndTurn, lastPlayed, floaters }
  function draw(state) {
    const { match, screen } = state;
    if (screen === SCREEN_TITLE) {
      drawTitle(match, state.best);
      return;
    }
    if (screen === SCREEN_WON || screen === SCREEN_LOST) {
      drawPlay(match, state);
      drawEndOverlay(match, screen === SCREEN_WON);
      return;
    }
    drawPlay(match, state);
  }

  return { draw, drawCard, pointInRect, hitHandCard };
}
