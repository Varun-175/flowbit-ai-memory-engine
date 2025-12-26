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

  // Will appear after normalization for Freight Co
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
  /**
   * Supports nested paths like:
   * - "serviceDate"
   * - "poNumber"
   * - "lineItems[0].sku"
   */
  field: string;
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

export type MemoryType = "VENDOR" | "CORRECTION";

export interface BaseMemory {
  id?: number;

  confidence: number; // [0, 1]
  usageCount: number;
  reinforcedCount: number; // approvals
  rejectedCount: number; // rejections

  lastUsedAt?: string; // ISO string
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
}

export interface VendorMemory extends BaseMemory {
  vendor: string;
  sourceKey: string; // e.g. "Leistungsdatum"
  targetField: string; // e.g. "serviceDate"
}

export interface CorrectionMemory extends BaseMemory {
  vendor?: string | null; // global or vendor-specific
  pattern: string; // e.g. "VAT_INCLUDED", "SKONTO", "FREIGHT_SKU"
  resolution: string; // e.g. "RECOMPUTE_TAX_FROM_GROSS"
}

export interface ResolutionMemory {
  invoiceId: string;
  vendor: string;
  memoryType: MemoryType;

  /**
   * Optional pointer for explainability:
   * - vendor: "Leistungsdatum->serviceDate"
   * - correction: "VAT_INCLUDED"
   */
  memoryRef?: string;

  approved: boolean;
  confidenceDelta: number;
  timestamp: string; // ISO string
}

/* =========================
   DUPLICATE TYPES
========================= */

export interface DuplicateMatch {
  vendor: string;
  invoiceNumber: string;
  invoiceId?: string;
  reason: string; // e.g. "same vendor+invoiceNumber"
}

/* =========================
   RECALL RESULT TYPE
========================= */

export interface MemoryContext {
  vendorMappings: VendorMemory[];
  applicableCorrections: CorrectionMemory[];
  isDuplicate: boolean;

  // Optional: for better reasoning in output
  duplicateMatch?: DuplicateMatch;
}

/* =========================
   AUDIT & DECISION TYPES
========================= */

export type AuditStep = "recall" | "apply" | "decide" | "learn";

export interface AuditEntry {
  step: AuditStep;
  timestamp: string; // ISO string
  details: string;

  /**
   * Optional structured debug info (still contract-safe)
   * because JSON output contract only requires step/timestamp/details.
   */
  meta?: Record<string, unknown>;
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

/**
 * Strongly-typed correction that keeps traceability.
 * IMPORTANT: memoryId + memoryType lets Decide/Learn reliably reinforce the right memory.
 */
export interface ProposedCorrection {
  field: string; // supports nested paths
  from: unknown;
  to: unknown;

  confidence: number; // [0, 1]
  source: CorrectionSource;
  reason: string;

  // Traceability (this is the big improvise)
  vendor?: string; // usually invoice.vendor
  memoryType?: MemoryType;
  memoryId?: number; // vendor_memory.id or correction_memory.id
  memoryRef?: string; // e.g. "Leistungsdatum->serviceDate" or "VAT_INCLUDED"
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
