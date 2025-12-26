import { db } from "./memoryStore";
import { VendorMemory } from "../types";
import * as conf from "./confidence";

export function findVendorMemory(vendor: string, sourceKey: string): Promise<VendorMemory | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, vendor, sourceKey, targetField, confidence, usageCount, reinforcedCount, rejectedCount, lastUsedAt, createdAt, updatedAt FROM vendor_memory WHERE vendor = ? AND sourceKey = ?`,
      [vendor, sourceKey],
      (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(row as VendorMemory);
      }
    );
  });
}

export function findVendorMappings(vendor: string): Promise<VendorMemory[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, vendor, sourceKey, targetField, confidence, usageCount, reinforcedCount, rejectedCount, lastUsedAt, createdAt, updatedAt FROM vendor_memory WHERE vendor = ? ORDER BY confidence DESC, usageCount DESC`,
      [vendor],
      (err, rows) => {
        if (err) reject(err);
        else if (!rows) resolve([]);
        else resolve(rows as VendorMemory[]);
      }
    );
  });
}

export function saveVendorMemory(memory: VendorMemory): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO vendor_memory (vendor, sourceKey, targetField, confidence, usageCount, reinforcedCount, rejectedCount, lastUsedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memory.vendor, memory.sourceKey, memory.targetField, memory.confidence, memory.usageCount, memory.reinforcedCount || 0, memory.rejectedCount || 0, now, now],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

export function incrementUsage(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE vendor_memory SET usageCount = usageCount + 1, lastUsedAt = ?, updatedAt = ? WHERE id = ?`,
      [now, now, id],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

export function reinforceMemory(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT confidence FROM vendor_memory WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject(new Error("Memory not found"));
      const oldConfidence = (row as any).confidence;
      const newConfidence = conf.reinforce(oldConfidence);
      const now = new Date().toISOString();
      db.run(
        `UPDATE vendor_memory SET confidence = ?, reinforcedCount = reinforcedCount + 1, updatedAt = ? WHERE id = ?`,
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
      `UPDATE vendor_memory SET rejectedCount = rejectedCount + 1, updatedAt = ? WHERE id = ?`,
      [now, id],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}
