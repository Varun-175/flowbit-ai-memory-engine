export const CONFIDENCE_INCREMENT = 0.05;
export const CONFIDENCE_DECAY_PER_DAY = 0.01;
export const MAX_CONFIDENCE = 0.95;
export const MIN_CONFIDENCE = 0.0;

export function reinforce(confidence: number): number {
  return Math.min(MAX_CONFIDENCE, confidence + CONFIDENCE_INCREMENT);
}

export function decay(confidence: number, daysUnused: number): number {
  const decayed = confidence - daysUnused * CONFIDENCE_DECAY_PER_DAY;
  return Math.max(MIN_CONFIDENCE, decayed);
}

export function shouldAutoApply(confidence: number, reinforcedCount: number): boolean {
  return confidence >= 0.75 && reinforcedCount >= 2;
}

export function getDaysSinceUse(lastUsedAt: string | null): number {
  if (!lastUsedAt) return 0;
  const lastUsed = new Date(lastUsedAt).getTime();
  const now = new Date().getTime();
  const ms = now - lastUsed;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function applyDecay(confidence: number, lastUsedAt: string | null): number {
  const days = getDaysSinceUse(lastUsedAt);
  return decay(confidence, days);
}
