import { recall } from "../engine/recall";
import { apply } from "../engine/apply";
import { decide } from "../engine/decide";
import { Invoice } from "../types";

export async function runInvoice1(invoice: Invoice) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 RUN: INV-A-001 (Before Learning)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    console.log("[RECALL] Querying memories for vendor:", invoice.vendor);
    const context = await recall(invoice);
    console.log(`  → Vendor mappings found: ${context.vendorMappings.length}`);
    console.log(`  → Applicable corrections found: ${context.applicableCorrections.length}`);
    console.log(`  → Is duplicate: ${context.isDuplicate}\n`);

    console.log("[APPLY] Generating correction suggestions...");
    const corrections = await apply(invoice, context);
    console.log(`  → Proposed ${corrections.length} correction(s):\n`);
    for (const c of corrections) {
      console.log(`    Field: ${c.field}`);
      console.log(`      From: ${JSON.stringify(c.from)}`);
      console.log(`      To: ${JSON.stringify(c.to)}`);
      console.log(`      Confidence: ${(c.confidence * 100).toFixed(1)}%`);
      console.log(`      Source: ${c.source}`);
      console.log(`      Reason: ${c.reason}\n`);
    }

    console.log("[DECIDE] Applying decision rules...");
    const decision = decide(invoice.vendor, invoice.fields.invoiceNumber, corrections, context);
    console.log(`  → Decision: ${decision.decision}`);
    console.log(`  → Requires human review: ${decision.requiresHumanReview}`);
    console.log(`  → Confidence score: ${(decision.confidenceScore * 100).toFixed(1)}%`);
    console.log(`  → Reasoning: ${decision.reasoning}\n`);

    return { context, corrections, decision };
  } catch (err) {
    console.error(`[ERROR]`, (err as Error).message);
    throw err;
  }
}
