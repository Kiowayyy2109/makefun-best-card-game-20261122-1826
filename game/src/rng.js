// Ember Duel — seeded random stream (mulberry32).
// One stream per match: the same seed always deals the same hands,
// which is what makes the screenshot scenes repeatable.

export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle driven by the seeded stream. Returns the array.
export function shuffleInPlace(rng, array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

// Pick an integer in [0, n).
export function pickInt(rng, n) {
  return Math.floor(rng() * n);
}
