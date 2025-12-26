import { db } from "./memoryStore";
import { CorrectionMemory } from "../types";
import * as conf from "./confidence";

export function findCorrectionMemory(pattern: string): Promise<CorrectionMemory | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, vendor, pattern, resolution, confidence, usageCount, reinforcedCount, rejectedCount, lastUsedAt, createdAt, updatedAt FROM correction_memory WHERE pattern = ?`,
      [pattern],
      (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(row as CorrectionMemory);
      }
    );
  });
}

export function findVendorCorrections(vendor: string): Promise<CorrectionMemory[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, vendor, pattern, resolution, confidence, usageCount, reinforcedCount, rejectedCount, lastUsedAt, createdAt, updatedAt FROM correction_memory WHERE vendor = ? OR vendor IS NULL ORDER BY confidence DESC, usageCount DESC`,
      [vendor],
      (err, rows) => {
        if (err) reject(err);
        else if (!rows) resolve([]);
        else resolve(rows as CorrectionMemory[]);
      }
    );
  });
}

export function saveCorrectionMemory(memory: CorrectionMemory): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO correction_memory (vendor, pattern, resolution, confidence, usageCount, reinforcedCount, rejectedCount, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [memory.vendor || null, memory.pattern, memory.resolution, memory.confidence, memory.usageCount, memory.reinforcedCount || 0, memory.rejectedCount || 0, now],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

export function incrementUsage(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE correction_memory SET usageCount = usageCount + 1, lastUsedAt = ?, updatedAt = ? WHERE id = ?`,
      [now, now, id],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

export function reinforceMemory(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT confidence FROM correction_memory WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject(new Error("Memory not found"));
      const oldConfidence = (row as any).confidence;
      const newConfidence = conf.reinforce(oldConfidence);
      const now = new Date().toISOString();
      db.run(
        `UPDATE correction_memory SET confidence = ?, reinforcedCount = reinforcedCount + 1, updatedAt = ? WHERE id = ?`,
        [newConfidence, now, id],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
  });
}

export function rejectMemory(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE correction_memory SET rejectedCount = rejectedCount + 1, updatedAt = ? WHERE id = ?`,
      [now, id],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}
