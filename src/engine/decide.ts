import {
  ProposedCorrection,
  DecisionType,
  MemoryContext,
  VendorMemory,
  CorrectionMemory,
} from "../types";
import { shouldAutoApply } from "../memory/confidence";

export interface DecisionResult {
  decision: DecisionType;
  requiresHumanReview: boolean;
  confidenceScore: number;
  reasoning: string;
}

/**
 * Decision rules (as per plan):
 * - Duplicate => ESCALATE (never auto-apply / never learn)
 * - No corrections => AUTO_ACCEPT
 * - AUTO_CORRECT only if: confidence >= 0.75 AND reinforcedCount >= 2
 * - Otherwise => ESCALATE (or "review-required" auto-correct if you want, but keeping it conservative)
 */
export function decide(
  vendor: string,
  invoiceNumber: string,
  corrections: ProposedCorrection[],
  context: MemoryContext
): DecisionResult {
  // 1) Duplicate guard
  if (context.isDuplicate) {
    return {
      decision: "ESCALATE",
      requiresHumanReview: true,
      confidenceScore: 0.0,
      reasoning: `Duplicate invoice detected (${vendor} / ${invoiceNumber}). Escalating to prevent contradictory memory.`,
    };
  }

  // 2) No discrepancies
  if (corrections.length === 0) {
    return {
      decision: "AUTO_ACCEPT",
      requiresHumanReview: false,
      confidenceScore: 1.0,
      reasoning: "No proposed corrections. Invoice accepted as extracted.",
    };
  }

  // 3) Find top correction safely (no reduce-empty crash)
  const topCorrection = getTopCorrection(corrections);
  const maxConfidence = topCorrection.confidence;

  // 4) Determine reinforcement count from the underlying memory record
  const reinforcedCount = getReinforcedCount(topCorrection, context);

  // 5) Auto-apply gate
  if (shouldAutoApply(maxConfidence, reinforcedCount)) {
    return {
      decision: "AUTO_CORRECT",
      requiresHumanReview: false,
      confidenceScore: maxConfidence,
      reasoning: `Auto-correct allowed: confidence=${maxConfidence.toFixed(
        2
      )}, reinforcedCount=${reinforcedCount}. Applying fields: ${corrections
        .map((c) => c.field)
        .join(", ")}.`,
    };
  }

  // 6) Conservative default: escalate (Flowbit prefers safe learning)
  return {
    decision: "ESCALATE",
    requiresHumanReview: true,
    confidenceScore: maxConfidence,
    reasoning: `Escalated: confidence=${maxConfidence.toFixed(
      2
    )}, reinforcedCount=${reinforcedCount}. Low/insufficient reinforcement so memory will not be auto-applied.`,
  };
}

function getTopCorrection(corrections: ProposedCorrection[]): ProposedCorrection {
  // Corrections is non-empty here, but keep it safe anyway
  let best = corrections[0];
  for (const c of corrections) {
    if (c.confidence > best.confidence) best = c;
  }
  return best;
}

function getReinforcedCount(
  top: ProposedCorrection,
  context: MemoryContext
): number {
  if (top.source === "vendor_memory") {
    // Match by targetField (= correction.field)
    const mem = context.vendorMappings.find(
      (vm: VendorMemory) => vm.targetField === top.field
    );
    return mem?.reinforcedCount ?? 0;
  }

  if (top.source === "correction_memory") {
    // Best effort match:
    // If your ProposedCorrection doesn't carry pattern/resolution id,
    // match by pattern keyword presence in reason OR by field group.
    const mem = context.applicableCorrections.find((cm: CorrectionMemory) => {
      if (top.reason.includes(cm.pattern)) return true;
      // fallback mapping
      if (cm.pattern === "VAT_INCLUDED" && (top.field === "taxTotal" || top.field === "netTotal")) return true;
      if (cm.pattern === "SKONTO" && top.field === "discountTerms") return true;
      if (cm.pattern === "FREIGHT_SKU" && top.field.includes("sku")) return true;
      return false;
    });

    return mem?.reinforcedCount ?? 0;
  }

  // heuristic/duplicate_guard etc.
  return 0;
}
