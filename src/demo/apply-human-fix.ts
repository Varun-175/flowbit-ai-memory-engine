import { saveVendorMemory } from "../memory/vendorMemory";
import { recordResolution } from "../memory/resolutionMemory";
import { Invoice, HumanCorrectionLog } from "../types";

export async function applyHumanFix(invoice: Invoice) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ APPLY HUMAN CORRECTION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    const humanFeedback: HumanCorrectionLog = {
      invoiceId: invoice.invoiceId,
      vendor: invoice.vendor,
      corrections: [
        {
          field: "serviceDate",
          from: null,
          to: "2024-01-15",
          reason: 'Found in rawText as "Leistungsdatum: 2024-01-15"',
        },
      ],
      finalDecision: "approved",
    };

    console.log("Human feedback:");
    console.log(`  Invoice: ${humanFeedback.invoiceId}`);
    console.log(`  Decision: ${humanFeedback.finalDecision}`);
    console.log(`  Corrections:`);
    for (const c of humanFeedback.corrections) {
      console.log(`    - ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    }

    console.log("\n[LEARN] Recording resolution (audit)...");
    for (const c of humanFeedback.corrections) {
      await recordResolution(
        invoice.invoiceId,
        invoice.vendor,
        "VENDOR",
        c.field,
        true,
        0.1
      );
    }
    console.log("  ✓ Resolution recorded\n");

    console.log("[LEARN] Storing vendor mapping...");
    await saveVendorMemory({
      vendor: invoice.vendor,
      sourceKey: "Leistungsdatum",
      targetField: "serviceDate",
      confidence: 0.3,
      usageCount: 0,
      reinforcedCount: 1,
      rejectedCount: 0,
    });
    console.log("  ✓ Stored: Leistungsdatum → serviceDate (confidence: 0.30, reinforced 1x)\n");
  } catch (err) {
    console.error(`[ERROR]`, (err as Error).message);
    throw err;
  }
}
