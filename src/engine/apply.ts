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
       2) APPLY VENDOR MEMORY (OVERRIDES HARD VALIDATION)
       ===================================================== */

    for (const mapping of context.vendorMappings) {
      if (!isVendorMappingRelevant(mapping, invoice.rawText)) continue;

      const decayedConfidence = conf.applyDecay(
        mapping.confidence,
        mapping.lastUsedAt ?? null
      );

      const suggestedValue = extractFieldValue(
        invoice.rawText,
        mapping.sourceKey
      );

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

/* =====================================================
   RELEVANCE HELPERS (APPLY-SCOPE)
   ===================================================== */

function isVendorMappingRelevant(
  mapping: VendorMemory,
  rawText: string
): boolean {
  return rawText.toLowerCase().includes(mapping.sourceKey.toLowerCase());
}

function isCorrectionRelevant(
  correction: CorrectionMemory,
  rawText: string
): boolean {
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
