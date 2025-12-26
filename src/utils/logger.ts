export function info(message: string, meta?: unknown): void {
  if (meta !== undefined) {
    console.log(`[INFO] ${message}`, meta);
  } else {
    console.log(`[INFO] ${message}`);
  }
}

export function warn(message: string, meta?: unknown): void {
  if (meta !== undefined) {
    console.warn(`[WARN] ${message}`, meta);
  } else {
    console.warn(`[WARN] ${message}`);
  }
}

export function error(message: string, meta?: unknown): void {
  if (meta instanceof Error) {
    console.error(`[ERROR] ${message}:`, meta.message, meta.stack);
  } else if (meta !== undefined) {
    console.error(`[ERROR] ${message}`, meta);
  } else {
    console.error(`[ERROR] ${message}`);
  }
}
