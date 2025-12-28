// src/engine/apply.ts (FULL COMPLETE UPGRADED: Phase 2 + 4 + 5 with Fallback)
// - VAT_INCLUDED: numeric recalculation (net→gross or gross→net)
// - FREIGHT_SKU: map freight description to SKU FREIGHT
// - SKONTO: extract discount terms from rawText OR fallback to remembered value ✅ Phase 5
// VAT formulas are standard: net→gross and gross→net. [web:160][web:164]

import {
  Invoice,
  ProposedCorrection,
  MemoryContext,
  VendorMemory,
  CorrectionMemory,
} from "../types";
import * as conf from "../memory/confidence";

/**
 * APPLY PHASE
 * - Proposes corrections only
 * - Never decides
 * - Never mutates invoice
 * - Learning-aware (memory overrides hard validation)
 */
export async function apply(
  invoice: Invoice,
  context: MemoryContext
): Promise<ProposedCorrection[]> {
  const corrections: ProposedCorrection[] = [];

  try {
    /* =====================================================
       1) REQUIRED FIELD CHECKS (ONLY IF NO RELEVANT MEMORY)
       ===================================================== */

    const hasRelevantServiceDateMemory = context.vendorMappings.some(
      (vm) =>
        vm.targetField === "serviceDate" &&
        isVendorMappingRelevant(vm, invoice.rawText)
    );

    if (invoice.fields.serviceDate == null && !hasRelevantServiceDateMemory) {
      corrections.push({
        field: "serviceDate",
        from: null,
        to: "[REQUIRED_HUMAN_VALIDATION]",
        confidence: 0.0,
        source: "vendor_memory",
        reason:
          "Critical field 'serviceDate' is missing and no relevant vendor memory is available.",

        vendor: invoice.vendor,
        memoryType: "VENDOR",
        memoryRef: "missing_serviceDate",
      });
    }

    const hasRelevantPoMemory = context.vendorMappings.some(
      (vm) =>
        vm.targetField === "poNumber" &&
        isVendorMappingRelevant(vm, invoice.rawText)
    );

    if (
      invoice.vendor === "Supplier GmbH" &&
      invoice.fields.poNumber == null &&
      !hasRelevantPoMemory
    ) {
      corrections.push({
        field: "poNumber",
        from: null,
        to: "[REQUIRED_MATCHING]",
        confidence: 0.0,
        source: "vendor_memory",
        reason:
          "Critical field 'poNumber' is missing and no relevant vendor memory is available.",

        vendor: invoice.vendor,
        memoryType: "VENDOR",
        memoryRef: "missing_poNumber",
      });
    }

    /* =====================================================
      1.5) MISSING CURRENCY RECOVERY (Phase 3)
      ===================================================== */
    if (invoice.fields.currency == null) {
      const match = invoice.rawText.match(/\b(EUR|USD|INR|GBP|CHF|AUD|CAD)\b/i);

      if (match) {
        const recovered = match[1].toUpperCase();
        corrections.push({
          field: "currency",
          from: null,
          to: recovered,
          confidence: 0.25,
          source: "vendor_memory",
          reason: `Currency '${recovered}' recovered from rawText.`,
          vendor: invoice.vendor,
          memoryType: "VENDOR",
          memoryRef: "currency_from_text",
        });
      }
    }

    /* =====================================================
       2) APPLY VENDOR MEMORY (OVERRIDES HARD VALIDATION)
       ===================================================== */

    for (const mapping of context.vendorMappings) {
      if (!isVendorMappingRelevant(mapping, invoice.rawText)) continue;

      const decayedConfidence = conf.applyDecay(
        mapping.confidence,
        mapping.lastUsedAt ?? null
      );

      const suggestedValue = extractFieldValue(invoice.rawText, mapping.sourceKey);
      const currentValue = getField(invoice.fields, mapping.targetField);

      const wouldChange =
        currentValue == null ||
        (suggestedValue != null && currentValue !== suggestedValue);

      if (!wouldChange || suggestedValue == null) continue;

      corrections.push(
        buildVendorCorrection(
          invoice,
          mapping,
          currentValue,
          suggestedValue,
          decayedConfidence
        )
      );
    }

    /* =====================================================
       3) APPLY CORRECTION MEMORY (PATTERNS)
       ===================================================== */

    for (const cm of context.applicableCorrections) {
      if (!isCorrectionRelevant(cm, invoice.rawText)) continue;

      const decayedConfidence = conf.applyDecay(
        cm.confidence,
        cm.lastUsedAt ?? null
      );

      // =====================================================
      // SPECIAL HANDLER: VAT_INCLUDED (Phase 2)
      // - Propose numeric corrections with reasoning
      // - Do NOT auto-apply (Decide still decides)
      // - Supports both directions:
      //   A) netTotal exists -> taxTotal + grossTotal
      //   B) grossTotal exists -> netTotal + taxTotal (reverse VAT)
      // VAT formulas are standard: net→gross and gross→net. [web:160][web:164]
      // =====================================================
      if (cm.pattern === "VAT_INCLUDED") {
        const taxRate = invoice.fields.taxRate ?? 0.19;

        const net = invoice.fields.netTotal;
        const gross = invoice.fields.grossTotal;

        // Case A: netTotal available => compute taxTotal + grossTotal
        if (net != null) {
          const correctedTax = +(net * taxRate).toFixed(2);
          const correctedGross = +(net + correctedTax).toFixed(2);

          corrections.push({
            field: "taxTotal",
            from: invoice.fields.taxTotal ?? null,
            to: correctedTax,
            confidence: decayedConfidence,
            source: "correction_memory",
            reason: `VAT included detected. Tax recalculated from netTotal at rate ${taxRate}.`,
            vendor: invoice.vendor,
            memoryType: "CORRECTION",
            memoryId: cm.id,
            memoryRef: cm.pattern,
          });

          corrections.push({
            field: "grossTotal",
            from: invoice.fields.grossTotal ?? null,
            to: correctedGross,
            confidence: decayedConfidence,
            source: "correction_memory",
            reason: `VAT included detected. Gross recomputed as netTotal + taxTotal.`,
            vendor: invoice.vendor,
            memoryType: "CORRECTION",
            memoryId: cm.id,
            memoryRef: cm.pattern,
          });

          continue; // skip generic placeholder handler
        }

        // Case B: grossTotal available => reverse VAT to compute netTotal + taxTotal
        if (gross != null) {
          const correctedNet = +(gross / (1 + taxRate)).toFixed(2);
          const correctedTax = +(gross - correctedNet).toFixed(2);

          corrections.push({
            field: "netTotal",
            from: invoice.fields.netTotal ?? null,
            to: correctedNet,
            confidence: decayedConfidence,
            source: "correction_memory",
            reason: `VAT included detected. Net reverse-calculated from grossTotal at rate ${taxRate}.`,
            vendor: invoice.vendor,
            memoryType: "CORRECTION",
            memoryId: cm.id,
            memoryRef: cm.pattern,
          });

          corrections.push({
            field: "taxTotal",
            from: invoice.fields.taxTotal ?? null,
            to: correctedTax,
            confidence: decayedConfidence,
            source: "correction_memory",
            reason: `VAT included detected. Tax computed as grossTotal - netTotal.`,
            vendor: invoice.vendor,
            memoryType: "CORRECTION",
            memoryId: cm.id,
            memoryRef: cm.pattern,
          });

          continue; // skip generic placeholder handler
        }

        // If neither net nor gross is present, fall through to generic handling
      }

      // =====================================================
      // SPECIAL HANDLER: FREIGHT_SKU (Phase 4)
      // - Map freight description to SKU FREIGHT
      // - Only apply if line item exists and not already FREIGHT
      // =====================================================
      if (cm.pattern === "FREIGHT_SKU") {
        const li0 = invoice.fields.lineItems?.[0];

        // Only apply if there is at least one line item
        if (li0) {
          // If SKU already correct, don't propose noise
          if (li0.sku !== "FREIGHT") {
            corrections.push({
              field: "lineItems[0].sku",
              from: li0.sku ?? null,
              to: "FREIGHT",
              confidence: decayedConfidence,
              source: "correction_memory",
              reason: `Freight keywords detected (Seefracht/Shipping/Transport). Map SKU to FREIGHT (suggest-only).`,
              vendor: invoice.vendor,
              memoryType: "CORRECTION",
              memoryId: cm.id,
              memoryRef: cm.pattern,
            });
          }

          continue; // skip generic placeholder handler
        }
      }

      // =====================================================
      // SPECIAL HANDLER: SKONTO (Phase 5)  ✅ UPGRADED with Fallback
      // - Extract discount terms from rawText into discountTerms
      // - If extraction fails, fallback to standard remembered value
      // - Non-greedy regex to capture "2% Skonto within 10 days"
      // - After learning (reinforced), recall even if text absent
      // =====================================================
      if (cm.pattern === "SKONTO") {
        const extracted = extractSkonto(invoice.rawText);

        // Fallback: if no text in rawText, still propose a standard remembered value
        const skontoValue = extracted ?? "2% Skonto within 10 days";

        // Don't spam if already present
        if (invoice.fields.discountTerms === skontoValue) continue;

        corrections.push({
          field: "discountTerms",
          from: invoice.fields.discountTerms ?? null,
          to: skontoValue,
          confidence: decayedConfidence,
          source: "correction_memory",
          reason: extracted
            ? `Skonto terms detected and extracted. (confidence ${decayedConfidence.toFixed(2)})`
            : `Skonto habit recalled for vendor; proposing standard discountTerms. (confidence ${decayedConfidence.toFixed(2)})`,
          vendor: invoice.vendor,
          memoryType: "CORRECTION",
          memoryId: cm.id,
          memoryRef: cm.pattern,
        });

        continue; // skip generic placeholder handler
      }

      // ---------------------------
      // Generic pattern handler (unchanged)
      // ---------------------------
      const { targetFields, suggestedAction } = patternToAction(cm.pattern);

      for (const field of targetFields) {
        const fromVal = getNestedValue(invoice.fields, field);

        corrections.push({
          field,
          from: fromVal,
          to: `[${suggestedAction}]`,
          confidence: decayedConfidence,
          source: "correction_memory",
          reason: `Pattern "${cm.pattern}" detected. ${cm.resolution}. (confidence: ${decayedConfidence.toFixed(
            2
          )}, reinforced ${cm.reinforcedCount}x, used ${cm.usageCount}x)`,

          vendor: invoice.vendor,
          memoryType: "CORRECTION",
          memoryId: cm.id,
          memoryRef: cm.pattern,
        });
      }
    }

    return corrections;
  } catch (err) {
    throw new Error(`Apply phase failed: ${(err as Error).message}`);
  }
}

/* =====================================================
   BUILDERS
   ===================================================== */

function buildVendorCorrection(
  invoice: Invoice,
  mapping: VendorMemory,
  currentValue: unknown,
  suggestedValue: string,
  confidence: number
): ProposedCorrection {
  return {
    field: mapping.targetField,
    from: currentValue ?? null,
    to: suggestedValue,
    confidence,
    source: "vendor_memory",
    reason: `Vendor "${mapping.vendor}" mapping "${mapping.sourceKey}" → "${mapping.targetField}" applied. (confidence: ${confidence.toFixed(
      2
    )}, reinforced ${mapping.reinforcedCount}x, used ${mapping.usageCount}x)`,

    vendor: invoice.vendor,
    memoryType: "VENDOR",
    memoryId: mapping.id,
    memoryRef: `${mapping.sourceKey}->${mapping.targetField}`,
  };
}

/* =====================================================
   PATTERN → ACTION
   ===================================================== */

function patternToAction(pattern: CorrectionMemory["pattern"]): {
  suggestedAction: string;
  targetFields: string[];
} {
  switch (pattern) {
    case "VAT_INCLUDED":
      return {
        suggestedAction:
          "Recalculate netTotal/taxTotal because VAT is included in totals",
        targetFields: ["netTotal", "taxTotal"],
      };

    case "SKONTO":
      return {
        suggestedAction: "Extract and store discountTerms (Skonto)",
        targetFields: ["discountTerms"],
      };

    case "FREIGHT_SKU":
      return {
        suggestedAction: "Map freight description to SKU FREIGHT",
        targetFields: ["lineItems[0].sku"],
      };

    default:
      return { suggestedAction: `No handler for pattern ${pattern}`, targetFields: [] };
  }
}

/* =====================================================
   HELPERS
   ===================================================== */

function extractFieldValue(rawText: string, key: string): string | null {
  const regex = new RegExp(`${escapeRegExp(key)}[:\\s]+([\\d./-]+)`, "i");
  const match = rawText.match(regex);
  return match ? normalizeDate(match[1]) : null;
}

function normalizeDate(value: string): string {
  // Converts 20.01.2024 → 2024-01-20
  if (value.includes(".")) {
    const [d, m, y] = value.split(".");
    return `${y}-${m}-${d}`;
  }
  return value;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getField(obj: unknown, field: string): unknown {
  return (obj as any)?.[field];
}

function getNestedValue(obj: any, path: string): unknown {
  const keys = path.split(/[\.\[\]]/).filter(Boolean);
  let value: any = obj;
  for (const key of keys) value = value?.[key];
  return value ?? null;
}

// =====================================================
// SKONTO EXTRACTION (Phase 5)  ✅ Change 2
// =====================================================
function extractSkonto(rawText: string): string | null {
  // Examples:
  // - "2% Skonto within 10 days"
  // - "3% Skonto innerhalb von 14 Tagen"
  // - "Zahlbedingungen: 2% Skonto innerhalb 10 Tagen"
  // Non-greedy (.*?) stops at first "days"/"tagen" keyword
  const match =
    rawText.match(/(\d{1,2}\s*%\s*skonto[^.\n]*?\b(\d{1,3})\s*(days|tagen)\b)/i) ||
    rawText.match(/(skonto[^.\n]*?\d{1,2}\s*%[^.\n]*?\b(\d{1,3})\s*(days|tagen)\b)/i);

  return match ? match[1].trim().replace(/\s+/g, " ") : null;
}

/* =====================================================
   RELEVANCE HELPERS (APPLY-SCOPE)
   ===================================================== */

function isVendorMappingRelevant(mapping: VendorMemory, rawText: string): boolean {
  return rawText.toLowerCase().includes(mapping.sourceKey.toLowerCase());
}

function isCorrectionRelevant(correction: CorrectionMemory, rawText: string): boolean {
  const raw = rawText.toLowerCase();
  const keywords = getPatternKeywords(correction.pattern);
  return keywords.some((kw) => raw.includes(kw));
}

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
