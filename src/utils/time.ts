export function nowIso(): string {
  return new Date().toISOString();
}

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function diffInHours(a: string | Date, b: string | Date): number {
  const d1 = toDate(a).getTime();
  const d2 = toDate(b).getTime();
  return (d1 - d2) / (1000 * 60 * 60);
}
