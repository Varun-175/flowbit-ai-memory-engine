import sqlite3 from "sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "../data/memory.sqlite");
export const db = new sqlite3.Database(DB_PATH);

function run(sql: string): void {
  db.run(sql, (err) => {
    if (err) throw err;
  });
}

/* =========================
   DATABASE INITIALIZATION
========================= */
export function initDatabase(): void {
  db.serialize(() => {
    // Safer defaults for concurrency
    run(`PRAGMA journal_mode = WAL;`);
    run(`PRAGMA foreign_keys = ON;`);

    // 1) Vendor memory: one row per mapping (vendor + sourceKey + targetField)
    run(`
      CREATE TABLE IF NOT EXISTS vendor_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor TEXT NOT NULL,
        sourceKey TEXT NOT NULL,
        targetField TEXT NOT NULL,

        confidence REAL NOT NULL DEFAULT 0.3,
        usageCount INTEGER NOT NULL DEFAULT 0,
        reinforcedCount INTEGER NOT NULL DEFAULT 0,
        rejectedCount INTEGER NOT NULL DEFAULT 0,

        lastUsedAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),

        UNIQUE (vendor, sourceKey, targetField)
      )
    `);
    run(`CREATE INDEX IF NOT EXISTS idx_vendor_memory_vendor ON vendor_memory(vendor);`);

    // 2) Correction memory: optionally vendor-specific
    run(`
      CREATE TABLE IF NOT EXISTS correction_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor TEXT,
        pattern TEXT NOT NULL,
        resolution TEXT NOT NULL,

        confidence REAL NOT NULL DEFAULT 0.3,
        usageCount INTEGER NOT NULL DEFAULT 0,
        reinforcedCount INTEGER NOT NULL DEFAULT 0,
        rejectedCount INTEGER NOT NULL DEFAULT 0,

        lastUsedAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),

        UNIQUE (vendor, pattern, resolution)
      )
    `);
    run(`CREATE INDEX IF NOT EXISTS idx_correction_memory_vendor ON correction_memory(vendor);`);
    run(`CREATE INDEX IF NOT EXISTS idx_correction_memory_pattern ON correction_memory(pattern);`);

    // 3) Resolution memory: track human approve/reject (per invoice issue/action)
    run(`
      CREATE TABLE IF NOT EXISTS resolution_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId TEXT NOT NULL,
        vendor TEXT NOT NULL,
        memoryType TEXT NOT NULL,      -- 'VENDOR' | 'CORRECTION'
        memoryRef TEXT,               -- optional pointer: e.g. "Leistungsdatum->serviceDate" or pattern key
        approved INTEGER NOT NULL,     -- 1/0
        confidenceDelta REAL NOT NULL DEFAULT 0.0,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    run(`CREATE INDEX IF NOT EXISTS idx_resolution_invoice ON resolution_memory(invoiceId);`);

    // 4) Audit trail must be per invoice
    run(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId TEXT NOT NULL,
        step TEXT NOT NULL,            -- recall|apply|decide|learn
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        details TEXT NOT NULL
      )
    `);
    run(`CREATE INDEX IF NOT EXISTS idx_audit_invoice ON audit_trail(invoiceId);`);

    // 5) Confidence events: track how confidence evolved
    run(`
      CREATE TABLE IF NOT EXISTS confidence_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memoryType TEXT NOT NULL,      -- 'VENDOR' | 'CORRECTION'
        memoryId INTEGER NOT NULL,
        oldConfidence REAL,
        newConfidence REAL NOT NULL,
        delta REAL NOT NULL,
        reason TEXT NOT NULL,          -- 'reinforce' | 'decay' | 'applied' | 'rejected'
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    run(`CREATE INDEX IF NOT EXISTS idx_conf_events_mem ON confidence_events(memoryType, memoryId);`);

    // 6) Duplicate records: prevent reinforcement on duplicates
    run(`
      CREATE TABLE IF NOT EXISTS duplicate_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor TEXT NOT NULL,
        invoiceNumber TEXT NOT NULL,
        invoiceId TEXT NOT NULL,
        detectedAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (vendor, invoiceNumber, invoiceId)
      )
    `);
    run(`CREATE INDEX IF NOT EXISTS idx_dupes_vendor_number ON duplicate_records(vendor, invoiceNumber);`);
  });
}
