// =========================
// duplicateGuard.ts (FULL)
// =========================
import { db } from "./memoryStore";

/**
 * Added from code1 (table init)
 * NOTE: Safe to call repeatedly because of IF NOT EXISTS.
 */
export async function initDuplicateTable(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    db.exec(
      `
      CREATE TABLE IF NOT EXISTS invoice_seen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        UNIQUE(vendor, invoice_number)
      );
    `,
      (err: any) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Existing code2 (UNCHANGED)
 */
export function isDuplicateInvoice(vendor: string, invoiceNumber: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM duplicate_records WHERE vendor = ? AND invoiceNumber = ? LIMIT 1`,
      [vendor, invoiceNumber],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

export function recordDuplicate(vendor: string, invoiceNumber: string, invoiceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO duplicate_records (vendor, invoiceNumber, invoiceId) VALUES (?, ?, ?)`,
      [vendor, invoiceNumber, invoiceId],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export function getDuplicatesForVendor(
  vendor: string
): Promise<Array<{ vendor: string; invoiceNumber: string; invoiceId: string; detectedAt: string }>> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT vendor, invoiceNumber, invoiceId, detectedAt FROM duplicate_records WHERE vendor = ? ORDER BY detectedAt DESC`,
      [vendor],
      (err, rows) => {
        if (err) reject(err);
        else if (!rows) resolve([]);
        else
          resolve(
            rows.map((r: any) => ({
              vendor: r.vendor,
              invoiceNumber: r.invoiceNumber,
              invoiceId: r.invoiceId,
              detectedAt: r.detectedAt,
            }))
          );
      }
    );
  });
}

/**
 * Added from code1 (functions) WITHOUT changing code2 exports.
 * These are additional helpers for the invoice_seen table.
 */

/** Returns true if invoice already seen (invoice_seen table) */
export function isDuplicateInvoiceSeen(vendor: string, invoiceNumber: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 1 FROM invoice_seen WHERE vendor = ? AND invoice_number = ? LIMIT 1`,
      [vendor, invoiceNumber],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

/** Marks invoice as seen (called ONLY after non-duplicate processing) */
export function markInvoiceSeen(vendor: string, invoiceNumber: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO invoice_seen (vendor, invoice_number, first_seen_at)
       VALUES (?, ?, datetime('now'))`,
      [vendor, invoiceNumber],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}
