import { db } from "./memoryStore";
import { ResolutionMemory, MemoryType } from "../types";

export function recordResolution(
  invoiceId: string,
  vendor: string,
  memoryType: MemoryType,
  memoryRef: string | undefined,
  approved: boolean,
  confidenceDelta: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO resolution_memory (invoiceId, vendor, memoryType, memoryRef, approved, confidenceDelta) VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceId, vendor, memoryType, memoryRef || null, approved ? 1 : 0, confidenceDelta],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export function getInvoiceResolutions(invoiceId: string): Promise<ResolutionMemory[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT invoiceId, vendor, memoryType, memoryRef, approved, confidenceDelta, timestamp FROM resolution_memory WHERE invoiceId = ? ORDER BY timestamp DESC`,
      [invoiceId],
      (err, rows) => {
        if (err) reject(err);
        else if (!rows) resolve([]);
        else resolve(rows.map((r: any) => ({
          invoiceId: r.invoiceId,
          vendor: r.vendor,
          memoryType: r.memoryType as MemoryType,
          memoryRef: r.memoryRef,
          approved: r.approved === 1,
          confidenceDelta: r.confidenceDelta,
          timestamp: r.timestamp,
        })));
      }
    );
  });
}
