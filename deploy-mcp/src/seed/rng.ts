/** Deterministic PRNG so every clone of the repo builds the exact same world. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED_NUMBER = 0xd2_2026_0827;

export function hex(rnd: () => number, len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(rnd() * 16)];
  return out;
}

export function jitter(rnd: () => number, base: number, pct: number): number {
  return base * (1 + (rnd() * 2 - 1) * pct);
}