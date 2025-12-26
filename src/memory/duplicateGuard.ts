import { db } from "./memoryStore";

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

export function getDuplicatesForVendor(vendor: string): Promise<Array<{vendor: string; invoiceNumber: string; invoiceId: string; detectedAt: string}>> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT vendor, invoiceNumber, invoiceId, detectedAt FROM duplicate_records WHERE vendor = ? ORDER BY detectedAt DESC`,
      [vendor],
      (err, rows) => {
        if (err) reject(err);
        else if (!rows) resolve([]);
        else resolve(rows.map((r: any) => ({vendor: r.vendor, invoiceNumber: r.invoiceNumber, invoiceId: r.invoiceId, detectedAt: r.detectedAt})));
      }
    );
  });
}
