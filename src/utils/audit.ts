type AuditEvent = {
  type: string;
  message: string;
  at: string;
  meta?: unknown;
};

export function recordAudit(event: AuditEvent): void {
  // Simple stdout audit; DB/file can be added later.
  console.log(
    `[AUDIT] ${event.at} [${event.type}] ${event.message}`,
    event.meta ?? ""
  );
}
