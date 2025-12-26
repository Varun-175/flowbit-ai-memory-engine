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

export function decide(
  vendor: string,
  invoiceNumber: string,
  corrections: ProposedCorrection[],
  context: MemoryContext
): DecisionResult {
  if (context.isDuplicate) {
    return {
      decision: "ESCALATE",
      requiresHumanReview: true,
      confidenceScore: 0.0,
      reasoning: `Duplicate invoice detected (${vendor} / ${invoiceNumber}). Escalating to prevent contradictory memory.`,
    };
  }

  if (corrections.length === 0) {
    return {
      decision: "AUTO_ACCEPT",
      requiresHumanReview: false,
      confidenceScore: 1.0,
      reasoning: "No proposed corrections. Invoice accepted as extracted.",
    };
  }

  const topCorrection = getTopCorrection(corrections);
  const maxConfidence = topCorrection.confidence;

  const reinforcedCount = getReinforcedCount(topCorrection, context);

  if (shouldAutoApply(maxConfidence, reinforcedCount)) {
    return {
      decision: "AUTO_CORRECT",
      requiresHumanReview: false,
      confidenceScore: maxConfidence,
      reasoning: `Auto-correct allowed: confidence=${maxConfidence.toFixed(
        2
      )}, reinforcedCount=${reinforcedCount}x. Applying fields: ${corrections
        .map((c) => c.field)
        .join(", ")}.`,
    };
  }

  return {
    decision: "ESCALATE",
    requiresHumanReview: true,
    confidenceScore: maxConfidence,
    reasoning: `Escalated: confidence=${maxConfidence.toFixed(
      2
    )}, reinforcedCount=${reinforcedCount}x. Low/insufficient reinforcement so memory will not be auto-applied.`,
  };
}

function getTopCorrection(corrections: ProposedCorrection[]): ProposedCorrection {
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
    const mem = context.vendorMappings.find(
      (vm: VendorMemory) => vm.targetField === top.field
    );
    return mem?.reinforcedCount ?? 0;
  }

  if (top.source === "correction_memory") {
    const mem = context.applicableCorrections.find((cm: CorrectionMemory) => {
      if (top.memoryId && cm.id === top.memoryId) return true;
      if (top.memoryRef && cm.pattern === top.memoryRef) return true;
      if (top.reason.includes(cm.pattern)) return true;
      if (cm.pattern === "VAT_INCLUDED" && (top.field === "taxTotal" || top.field === "netTotal")) return true;
      if (cm.pattern === "SKONTO" && top.field === "discountTerms") return true;
      if (cm.pattern === "FREIGHT_SKU" && top.field.includes("sku")) return true;
      return false;
    });

    return mem?.reinforcedCount ?? 0;
  }

  return 0;
}
