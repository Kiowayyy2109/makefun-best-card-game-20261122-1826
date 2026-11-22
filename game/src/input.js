// Ember Duel — keyboard and mouse input.
// Clicks and taps select cards; keys 1-7 play a hand card, Space/Enter
// confirms (start / end turn), M mutes, Esc pauses to the title screen.

export const ACTION_CONFIRM = 1;
export const ACTION_MUTE = 2;
export const ACTION_TITLE = 4;

export function createInput(canvas) {
  let actions = 0;
  let numberKey = 0; // 1..7 pressed this frame, 0 = none
  let click = null; // {x, y} in canvas CSS pixels, consumed by the game
  let hover = { x: -1, y: -1 };

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointermove', (event) => {
    hover = canvasPoint(event);
  });
  canvas.addEventListener('pointerleave', () => {
    hover = { x: -1, y: -1 };
  });
  canvas.addEventListener('pointerdown', (event) => {
    click = canvasPoint(event);
  });
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = event.key;
    if (key === ' ' || key === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (key === 'm' || key === 'M') {
      actions |= ACTION_MUTE;
    } else if (key === 'Escape') {
      actions |= ACTION_TITLE;
    } else if (key >= '1' && key <= '7') {
      numberKey = Number.parseInt(key, 10);
    }
  });

  return {
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeNumberKey() {
      const taken = numberKey;
      numberKey = 0;
      return taken;
    },
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    hover() {
      return hover;
    },
  };
}
