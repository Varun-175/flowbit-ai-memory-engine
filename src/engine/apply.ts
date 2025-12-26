import {
  Invoice,
  ProposedCorrection,
  MemoryContext,
  VendorMemory,
  CorrectionMemory,
} from "../types";
import { isVendorMappingRelevant, isCorrectionRelevant } from "./recall";
import * as conf from "../memory/confidence";

export async function apply(
  invoice: Invoice,
  context: MemoryContext
): Promise<ProposedCorrection[]> {
  const corrections: ProposedCorrection[] = [];

  try {
    // -----------------------------
    // 1) Apply vendor mappings
    // -----------------------------
    for (const mapping of context.vendorMappings) {
      if (!isVendorMappingRelevant(mapping, invoice.rawText)) continue;

      const decayedConfidence = conf.applyDecay(
        mapping.confidence,
        mapping.lastUsedAt ?? null
      );

      const suggestedValue = extractFieldValue(invoice.rawText, mapping.sourceKey);

      // Only propose a correction if it actually changes something or fills a null
      const currentValue = getField(invoice.fields, mapping.targetField);
      const wouldChange =
        currentValue == null || (suggestedValue != null && currentValue !== suggestedValue);

      if (!wouldChange) continue;

      corrections.push(buildVendorCorrection(invoice, mapping, currentValue, suggestedValue, decayedConfidence));
    }

    // -----------------------------
    // 2) Apply correction memories (patterns)
    // -----------------------------
    for (const cm of context.applicableCorrections) {
      if (!isCorrectionRelevant(cm, invoice.rawText)) continue;

      const decayedConfidence = conf.applyDecay(cm.confidence, cm.lastUsedAt ?? null);

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

          // Traceability (critical)
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

/* -----------------------------
   Builders (clean + consistent)
----------------------------- */

function buildVendorCorrection(
  invoice: Invoice,
  mapping: VendorMemory,
  currentValue: unknown,
  suggestedValue: string | null,
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

    // Traceability (critical)
    vendor: invoice.vendor,
    memoryType: "VENDOR",
    memoryId: mapping.id,
    memoryRef: `${mapping.sourceKey}->${mapping.targetField}`,
  };
}

function patternToAction(pattern: CorrectionMemory["pattern"]): {
  suggestedAction: string;
  targetFields: string[];
} {
  if (pattern === "VAT_INCLUDED") {
    return {
      suggestedAction: "Recalculate netTotal/taxTotal because VAT is included in totals",
      targetFields: ["netTotal", "taxTotal"],
    };
  }

  if (pattern === "SKONTO") {
    return {
      suggestedAction: "Extract and store discountTerms (Skonto)",
      targetFields: ["discountTerms"],
    };
  }

  if (pattern === "FREIGHT_SKU") {
    return {
      suggestedAction: "Map freight description to SKU FREIGHT",
      targetFields: ["lineItems[0].sku"],
    };
  }

  // Default: keep it safe (don’t propose unknown patterns)
  return { suggestedAction: `No handler for pattern ${pattern}`, targetFields: [] };
}

/* -----------------------------
   Helpers
----------------------------- */

function extractFieldValue(rawText: string, key: string): string | null {
  // Example: "Leistungsdatum 20.01.2024" or "Leistungsdatum: 20.01.2024"
  const regex = new RegExp(`${escapeRegExp(key)}[:\\s]+([\\d\\-\\/\\.]+)`, "i");
  const match = rawText.match(regex);
  return match ? match[1] : null;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getField(obj: unknown, field: string): unknown {
  return (obj as any)?.[field];
}

/**
 * Supports nested paths like "lineItems[0].sku".
 */
function getNestedValue(obj: any, path: string): unknown {
  const keys = path.split(/[\.\[\]]/).filter((k) => k.length > 0);
  let value: any = obj;
  for (const key of keys) {
    value = value?.[key];
  }
  return value ?? null;
}
