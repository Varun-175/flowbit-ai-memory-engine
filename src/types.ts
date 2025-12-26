/* =========================
   CORE DOMAIN TYPES
========================= */

export interface LineItem {
  sku?: string | null;
  description?: string;
  qty: number;
  unitPrice: number;
}

export interface InvoiceFields {
  invoiceNumber: string;
  invoiceDate: string;
  serviceDate?: string | null;
  currency?: string | null;
  poNumber?: string | null;
  netTotal: number;
  taxRate: number;
  taxTotal: number;
  grossTotal: number;
  lineItems: LineItem[];
  // Optional: will appear after normalization for Freight Co
  discountTerms?: string | null;
}

export interface Invoice {
  invoiceId: string;
  vendor: string;
  fields: InvoiceFields;
  confidence: number;
  rawText: string;
}

/* =========================
   HUMAN CORRECTIONS (Appendix)
========================= */

export type HumanFinalDecision = "approved" | "rejected";

export interface HumanCorrection {
  field: string; // supports paths like "lineItems[0].sku"
  from: unknown;
  to: unknown;
  reason: string;
}

export interface HumanCorrectionLog {
  invoiceId: string;
  vendor: string;
  corrections: HumanCorrection[];
  finalDecision: HumanFinalDecision;
}

/* =========================
   MEMORY TYPES
========================= */

export interface BaseMemory {
  id?: number;
  confidence: number;       // [0, 1]
  usageCount: number;
  reinforcedCount: number;  // approvals
  rejectedCount: number;    // rejections
  lastUsedAt?: string;      // ISO string
  createdAt?: string;       // ISO string
  updatedAt?: string;       // ISO string
}

export interface VendorMemory extends BaseMemory {
  vendor: string;
  sourceKey: string;    // e.g. "Leistungsdatum"
  targetField: string;  // e.g. "serviceDate"
}

export interface CorrectionMemory extends BaseMemory {
  vendor?: string | null; // allow global or vendor-specific patterns
  pattern: string;        // e.g. "VAT_INCLUDED"
  resolution: string;     // e.g. "RECOMPUTE_TAX_FROM_GROSS"
}

export type MemoryType = "VENDOR" | "CORRECTION";

export interface ResolutionMemory {
  invoiceId: string;
  vendor: string;
  memoryType: MemoryType;
  memoryRef?: string;       // optional pointer (e.g., pattern name or mapping key)
  approved: boolean;
  confidenceDelta: number;
  timestamp: string;        // ISO string
}

/* =========================
   AUDIT & DECISION TYPES
========================= */

export type AuditStep = "recall" | "apply" | "decide" | "learn";

export interface AuditEntry {
  step: AuditStep;
  timestamp: string; // ISO string
  details: string;
}

export type DecisionType = "AUTO_ACCEPT" | "AUTO_CORRECT" | "ESCALATE";

/* =========================
   PROPOSED CORRECTIONS (Explainable)
========================= */

export type CorrectionSource =
  | "vendor_memory"
  | "correction_memory"
  | "heuristic"
  | "duplicate_guard";

export interface ProposedCorrection {
  field: string; // supports nested paths
  from: unknown;
  to: unknown;
  confidence: number; // [0, 1]
  source: CorrectionSource;
  reason: string;
}

/* =========================
   FINAL OUTPUT CONTRACT
========================= */

export interface DecisionOutput {
  normalizedInvoice: Record<string, unknown>;
  proposedCorrections: ProposedCorrection[];
  requiresHumanReview: boolean;
  decision: DecisionType;
  reasoning: string;
  confidenceScore: number;
  memoryUpdates: string[];
  auditTrail: AuditEntry[];
}
