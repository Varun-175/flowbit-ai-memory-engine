import {
  Invoice,
  HumanCorrectionLog,
  HumanCorrection,
  MemoryType,
  // NOTE: learn.ts does NOT need MemoryContext if you implement the duplicate-skip in decide()
  // If you *do* pass context into learn(), then import it and add it to the function signature.
} from "../types";

import * as vendorMemSvc from "../memory/vendorMemory";
import * as correctionMemSvc from "../memory/correctionMemory";
import * as resolutionMemSvc from "../memory/resolutionMemory";
import * as duplicateGuard from "../memory/duplicateGuard";

/**
 * Learn phase:
 * - Always record the human decision (resolution_memory) for auditability.
 * - Only learn/strengthen memories when finalDecision === "approved".
 * - Learn vendor mapping for Supplier GmbH cases like "Leistungsdatum found in rawText".
 * - Learn pattern correction memories for Parts AG / Freight Co patterns.
 *
 * DUPLICATE SAFETY (Phase 1):
 * - If invoice was already processed (vendor + invoiceNumber), skip learning to prevent contradictory memory. [web:7]
 */
export async function learn(invoice: Invoice, humanFeedback: HumanCorrectionLog): Promise<void> {
  try {
    const now = new Date().toISOString();

    /* =====================================================
       0) DUPLICATE HARD BLOCK (CRITICAL)
       - Uses invoice_seen table (vendor + invoice_number unique) as the "already processed" guard. [web:26]
       - If duplicate: do not write any new memory (vendor/correction), but still safe to just return.
       ===================================================== */

    const isDuplicate = await duplicateGuard.isDuplicateInvoiceSeen(
      invoice.vendor,
      invoice.fields.invoiceNumber
    );

    if (isDuplicate) {
      // If you have an audit service/table writer here, log it there.
      // Keeping it as a no-op return to avoid introducing new dependencies.
      return;
    }

    const approved = humanFeedback.finalDecision === "approved";
    const delta = approved ? 0.1 : -0.2;

    // 1) Always record resolutions (audit trail requirement)
    for (const c of humanFeedback.corrections) {
      await resolutionMemSvc.recordResolution(
        invoice.invoiceId,
        invoice.vendor,
        inferMemoryType(c),
        toMemoryRef(c),
        approved,
        delta
      );
    }

    // 2) Conservative learning: only on approval
    if (!approved) return;

    // 3) Learn vendor mappings (Supplier GmbH)
    for (const c of humanFeedback.corrections) {
      const vendorMapping = inferVendorMappingFromCorrection(invoice, c);
      if (!vendorMapping) continue;

      const { sourceKey, targetField } = vendorMapping;

      const existing = await vendorMemSvc.findVendorMemory(invoice.vendor, sourceKey);

      if (existing?.id) {
        await vendorMemSvc.reinforceMemory(existing.id);
      } else {
        await vendorMemSvc.saveVendorMemory({
          vendor: invoice.vendor,
          sourceKey,
          targetField,
          confidence: 0.3, // initial confidence per plan
          usageCount: 0,
          reinforcedCount: 1, // this approval is the first reinforcement
          rejectedCount: 0,
        });
      }
    }

    // 4) Learn correction patterns (Parts AG / Freight Co)
    const patterns = inferPatternsFromFeedback(invoice, humanFeedback);

    for (const p of patterns) {
      const existing = await correctionMemSvc.findCorrectionMemory(p.pattern);

      if (existing?.id) {
        await correctionMemSvc.reinforceMemory(existing.id);
      } else {
        await correctionMemSvc.saveCorrectionMemory({
          vendor: invoice.vendor,
          pattern: p.pattern,
          resolution: p.resolution,
          confidence: 0.3,
          usageCount: 0,
          reinforcedCount: 1,
          rejectedCount: 0,
        });
      }
    }

    /* =====================================================
       5) MARK AS SEEN (IMPORTANT)
       Only after successful non-duplicate processing.
       INSERT OR IGNORE relies on UNIQUE constraints to safely avoid duplicates. [web:113][web:26]
       ===================================================== */
    await duplicateGuard.markInvoiceSeen(invoice.vendor, invoice.fields.invoiceNumber);
  } catch (err) {
    throw new Error(`Learn phase failed: ${(err as Error).message}`);
  }
}

/* -------------------------
   Helpers
------------------------- */

function inferMemoryType(c: HumanCorrection): MemoryType {
  // Vendor mapping fields: serviceDate/poNumber/currency are vendor-ish
  // Correction pattern fields: grossTotal/taxTotal/netTotal/discountTerms/sku pattern-driven
  if (c.field.includes("tax") || c.field.includes("gross") || c.field.includes("net")) {
    return "CORRECTION";
  }
  if (c.field === "discountTerms" || c.field.includes("sku")) {
    return "CORRECTION";
  }
  return "VENDOR";
}

function toMemoryRef(c: HumanCorrection): string {
  // Store something stable in resolution_memory.memoryRef
  return c.field;
}

/**
 * Vendor mapping should be learned only when:
 * - field is serviceDate AND reason mentions Leistungsdatum (appendix),
 * OR you can safely infer a sourceKey from rawText.
 */
function inferVendorMappingFromCorrection(
  invoice: Invoice,
  c: HumanCorrection
): { sourceKey: string; targetField: string } | null {
  const reason = c.reason.toLowerCase();
  const raw = invoice.rawText.toLowerCase();

  if (
    c.field === "serviceDate" &&
    (reason.includes("leistungsdatum") || raw.includes("leistungsdatum"))
  ) {
    return { sourceKey: "Leistungsdatum", targetField: "serviceDate" };
  }

  return null;
}

function inferPatternsFromFeedback(
  invoice: Invoice,
  feedback: HumanCorrectionLog
): Array<{ pattern: string; resolution: string }> {
  const raw = invoice.rawText.toLowerCase();
  const changedFields = new Set(feedback.corrections.map((c) => c.field));

  const patterns: Array<{ pattern: string; resolution: string }> = [];

  // Parts AG: VAT included signals and corrected gross/tax
  const vatSignals = raw.includes("mwst") || raw.includes("vat") || raw.includes("incl");
  const vatFieldsTouched =
    changedFields.has("grossTotal") ||
    changedFields.has("taxTotal") ||
    changedFields.has("netTotal");

  if (vatSignals && vatFieldsTouched) {
    patterns.push({
      pattern: "VAT_INCLUDED",
      resolution: "RECOMPUTE_TAX_FROM_GROSS",
    });
  }

  // Freight Co: Skonto stored in discountTerms
  if (raw.includes("skonto") && changedFields.has("discountTerms")) {
    patterns.push({
      pattern: "SKONTO",
      resolution: "EXTRACT_DISCOUNT_TERMS",
    });
  }

  // Freight Co: Seefracht/Shipping => SKU FREIGHT
  const freightSignals = raw.includes("seefracht") || raw.includes("shipping");
  const skuTouched = [...changedFields].some((f) => f.includes("sku"));

  if (freightSignals && skuTouched) {
    patterns.push({
      pattern: "FREIGHT_SKU",
      resolution: "MAP_DESCRIPTION_TO_FREIGHT_SKU",
    });
  }

  return patterns;
}
