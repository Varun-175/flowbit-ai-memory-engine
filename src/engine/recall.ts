import { Invoice, MemoryContext, VendorMemory, CorrectionMemory, DuplicateMatch } from "../types";
import * as vendorMemSvc from "../memory/vendorMemory";
import * as correctionMemSvc from "../memory/correctionMemory";
import * as duplicateGuard from "../memory/duplicateGuard";

export async function recall(invoice: Invoice): Promise<MemoryContext> {
  try {
    const raw = invoice.rawText.toLowerCase();

    // 1) Duplicate check
    const isDuplicate = await duplicateGuard.isDuplicateInvoice(
      invoice.vendor,
      invoice.fields.invoiceNumber
    );

    const duplicateMatch: DuplicateMatch | undefined = isDuplicate
      ? {
          vendor: invoice.vendor,
          invoiceNumber: invoice.fields.invoiceNumber,
          invoiceId: invoice.invoiceId,
          reason: "Same vendor + invoiceNumber already seen",
        }
      : undefined;

    // 2) Pull all vendor memories + corrections for vendor
    const allVendorMappings = await vendorMemSvc.findVendorMappings(invoice.vendor);
    const allCorrections = await correctionMemSvc.findVendorCorrections(invoice.vendor);

    // 3) Filter to only relevant ones (reduces noise downstream)
    const vendorMappings = allVendorMappings.filter((vm: VendorMemory) =>
      isVendorMappingRelevant(vm, raw)
    );

    const applicableCorrections = allCorrections.filter((cm: CorrectionMemory) =>
      isCorrectionRelevant(cm, raw)
    );

    return {
      vendorMappings,
      applicableCorrections,
      isDuplicate,
      duplicateMatch,
    };
  } catch (err) {
    throw new Error(`Recall phase failed: ${(err as Error).message}`);
  }
}

/* -------------------------
   Relevance Helpers
------------------------- */

export function isVendorMappingRelevant(mapping: VendorMemory, rawLower: string): boolean {
  return rawLower.includes(mapping.sourceKey.toLowerCase());
}

export function isCorrectionRelevant(correction: CorrectionMemory, rawLower: string): boolean {
  const keywords = getPatternKeywords(correction.pattern);
  for (const kw of keywords) {
    if (rawLower.includes(kw)) return true;
  }
  return false;
}

function getPatternKeywords(pattern: string): string[] {
  // Keep these aligned with your learn.ts inference + appendix expectations
  switch (pattern) {
    case "VAT_INCLUDED":
      return ["vat", "mwst", "inkl", "incl", "included", "prices incl"];
    case "SKONTO":
      return ["skonto", "discount", "within", "days"];
    case "FREIGHT_SKU":
      return ["seefracht", "shipping", "transport"];
    default:
      return [];
  }
}
