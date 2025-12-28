// src/memory/correctionMemory.ts (FULL COMPLETE UPGRADED: Phase 2 + 4 + 5 seeds)
// - Seeds VAT_INCLUDED (Parts AG), FREIGHT_SKU (Freight & Co), SKONTO (Freight & Co)
// - reinforceMemory increments usageCount + lastUsedAt
// SQLite INSERT and UPDATE support multi-column updates. [web:207][web:232]

import { db } from "./memoryStore";
import { CorrectionMemory } from "../types";
import * as conf from "./confidence";

/* =========================
   SEED DEFAULT CORRECTIONS
========================= */
export async function seedDefaultCorrections(): Promise<void> {
  // -------------------------
  // Seed VAT_INCLUDED (Parts AG)
  // -------------------------
  const existingVat = await new Promise<any>((resolve, reject) => {
    db.get(
      `SELECT 1 FROM correction_memory WHERE vendor = ? AND pattern = ? LIMIT 1`,
      ["Parts AG", "VAT_INCLUDED"],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!existingVat) {
    await new Promise<void>((resolve, reject) => {
      db.run(
        `
        INSERT INTO correction_memory (
          vendor,
          pattern,
          resolution,
          confidence,
          usageCount,
          reinforcedCount,
          rejectedCount
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          "Parts AG",
          "VAT_INCLUDED",
          "VAT included in pricing. Recalculate tax and totals (suggest-only).",
          0.2,
          0,
          0,
          0,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // -------------------------
  // Seed FREIGHT_SKU (Freight & Co)
  // -------------------------
  const existingFreight = await new Promise<any>((resolve, reject) => {
    db.get(
      `SELECT 1 FROM correction_memory WHERE vendor = ? AND pattern = ? LIMIT 1`,
      ["Freight & Co", "FREIGHT_SKU"],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!existingFreight) {
    await new Promise<void>((resolve, reject) => {
      db.run(
        `
        INSERT INTO correction_memory (
          vendor,
          pattern,
          resolution,
          confidence,
          usageCount,
          reinforcedCount,
          rejectedCount
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          "Freight & Co",
          "FREIGHT_SKU",
          "Map freight description (Seefracht/Shipping/Transport) to SKU FREIGHT (suggest-only).",
          0.2,
          0,
          0,
          0,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // -------------------------
  // Seed SKONTO (Freight & Co)  ✅ Phase 5
  // -------------------------
  const existingSkonto = await new Promise<any>((resolve, reject) => {
    db.get(
      `SELECT 1 FROM correction_memory WHERE vendor = ? AND pattern = ? LIMIT 1`,
      ["Freight & Co", "SKONTO"],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!existingSkonto) {
    await new Promise<void>((resolve, reject) => {
      db.run(
        `
        INSERT INTO correction_memory (
          vendor,
          pattern,
          resolution,
          confidence,
          usageCount,
          reinforcedCount,
          rejectedCount
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          "Freight & Co",
          "SKONTO",
          "Extract and store discountTerms (Skonto) from invoice text (suggest-only).",
          0.2,
          0,
          0,
          0,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
}

/* =========================
   QUERIES
========================= */
export function findCorrectionMemory(pattern: string): Promise<CorrectionMemory | null> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, vendor, pattern, resolution, confidence, usageCount, reinforcedCount, rejectedCount, lastUsedAt, createdAt, updatedAt
       FROM correction_memory
       WHERE pattern = ?`,
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
      `SELECT id, vendor, pattern, resolution, confidence, usageCount, reinforcedCount, rejectedCount, lastUsedAt, createdAt, updatedAt
       FROM correction_memory
       WHERE vendor = ? OR vendor IS NULL
       ORDER BY confidence DESC, usageCount DESC`,
      [vendor],
      (err, rows) => {
        if (err) reject(err);
        else if (!rows) resolve([]);
        else resolve(rows as CorrectionMemory[]);
      }
    );
  });
}

/* =========================
   WRITES
========================= */
export function saveCorrectionMemory(memory: CorrectionMemory): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO correction_memory
       (vendor, pattern, resolution, confidence, usageCount, reinforcedCount, rejectedCount, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.vendor || null,
        memory.pattern,
        memory.resolution,
        memory.confidence,
        memory.usageCount,
        memory.reinforcedCount || 0,
        memory.rejectedCount || 0,
        now,
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export function incrementUsage(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE correction_memory
       SET usageCount = usageCount + 1,
           lastUsedAt = ?,
           updatedAt = ?
       WHERE id = ?`,
      [now, now, id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export function reinforceMemory(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT confidence FROM correction_memory WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject(new Error("Memory not found"));

      const oldConfidence = (row as any).confidence as number;
      const newConfidence = conf.reinforce(oldConfidence);
      const now = new Date().toISOString();

      db.run(
        `UPDATE correction_memory
         SET confidence = ?,
             reinforcedCount = reinforcedCount + 1,
             usageCount = usageCount + 1,
             lastUsedAt = ?,
             updatedAt = ?
         WHERE id = ?`,
        [newConfidence, now, now, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
}

export function rejectMemory(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE correction_memory
       SET rejectedCount = rejectedCount + 1,
           updatedAt = ?
       WHERE id = ?`,
      [now, id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}
