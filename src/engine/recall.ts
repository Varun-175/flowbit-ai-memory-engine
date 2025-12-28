import {
  Invoice,
  MemoryContext,
  VendorMemory,
  CorrectionMemory,
  DuplicateMatch,
} from "../types";
import * as vendorMemSvc from "../memory/vendorMemory";
import * as correctionMemSvc from "../memory/correctionMemory";
import * as duplicateGuard from "../memory/duplicateGuard";

/**
 * RECALL PHASE
 * - Retrieves ALL potentially relevant memory
 * - Does NOT aggressively filter
 * - Keeps learning robust and future-proof
 */
export async function recall(invoice: Invoice): Promise<MemoryContext> {
  try {
    const rawLower = invoice.rawText.toLowerCase();

    /* =====================================================
       1) DUPLICATE GUARD (HARD SAFETY)
       - Use invoice_seen (vendor + invoice_number) as the true "already processed" gate,
       - because it’s enforced via UNIQUE(vendor, invoice_number). [web:26]
       ===================================================== */

    const isDuplicate = await duplicateGuard.isDuplicateInvoiceSeen(
      invoice.vendor,
      invoice.fields.invoiceNumber
    );

    const duplicateMatch: DuplicateMatch | undefined = isDuplicate
      ? {
          vendor: invoice.vendor,
          invoiceNumber: invoice.fields.invoiceNumber,
          invoiceId: invoice.invoiceId,
          reason: "Same vendor + invoiceNumber already processed",
        }
      : undefined;

    /* =====================================================
       2) LOAD MEMORY (BROAD RETRIEVAL)
       ===================================================== */

    const vendorMappings = await vendorMemSvc.findVendorMappings(invoice.vendor);
    const correctionMemories = await correctionMemSvc.findVendorCorrections(
      invoice.vendor
    );

    /* =====================================================
       3) LIGHTWEIGHT SCORING (OPTIONAL, NON-DESTRUCTIVE)
       ===================================================== */

    const scoredVendorMappings = vendorMappings.map((vm) => ({
      ...vm,
      relevanceScore: computeVendorRelevance(vm, rawLower),
    }));

    const scoredCorrections = correctionMemories.map((cm) => ({
      ...cm,
      relevanceScore: computeCorrectionRelevance(cm, rawLower),
    }));

    /* =====================================================
       4) SORT (NOT FILTER!)
       ===================================================== */

    scoredVendorMappings.sort((a, b) => b.relevanceScore - a.relevanceScore);
    scoredCorrections.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      vendorMappings: scoredVendorMappings,
      applicableCorrections: scoredCorrections,
      isDuplicate,
      duplicateMatch,
    };
  } catch (err) {
    throw new Error(`Recall phase failed: ${(err as Error).message}`);
  }
}

/* =====================================================
   RELEVANCE SCORING HELPERS
   (Soft signals, never hard filters)
   ===================================================== */

function computeVendorRelevance(mapping: VendorMemory, rawLower: string): number {
  let score = 0;

  if (rawLower.includes(mapping.sourceKey.toLowerCase())) {
    score += 0.7;
  }

  // Confidence contributes softly
  score += Math.min(mapping.confidence, 0.3);

  return score;
}

function computeCorrectionRelevance(
  correction: CorrectionMemory,
  rawLower: string
): number {
  let score = 0;

  const keywords = getPatternKeywords(correction.pattern);
  for (const kw of keywords) {
    if (rawLower.includes(kw)) {
      score += 0.3;
    }
  }

  // Confidence & reinforcement help ordering
  score += Math.min(correction.confidence, 0.2);
  score += Math.min(correction.reinforcedCount * 0.05, 0.2);

  return score;
}

/* =====================================================
   PATTERN KEYWORDS (SHARED CONTRACT)
   ===================================================== */

function getPatternKeywords(pattern: string): string[] {
  switch (pattern) {
    case "VAT_INCLUDED":
      return ["vat", "mwst", "inkl", "incl", "included", "prices incl"];
    case "SKONTO":
      return ["skonto", "discount", "within", "days"];
    case "FREIGHT_SKU":
      return ["seefracht", "shipping", "transport", "freight"];
    default:
      return [];
  }
}
