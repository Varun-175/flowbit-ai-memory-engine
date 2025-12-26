import fs from "fs";
import path from "path";
import { initDatabase } from "./src/memory/memoryStore";
import { runInvoice1 } from "./src/demo/run-invoice-1";
import { applyHumanFix } from "./src/demo/apply-human-fix";
import { runInvoice2 } from "./src/demo/run-invoice-2";
import { Invoice } from "./src/types";

async function runDemo() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║   FLOWBIT AI MEMORY ENGINE - FULL DEMO                      ║");
  console.log("║   Learning from Human Feedback → Auto-Correction            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    console.log("\n[SETUP] Initializing SQLite database...");
    initDatabase();
    console.log("  ✓ Database initialized\n");

    console.log("[SETUP] Loading sample invoices...");
    const invoicesPath = path.join(__dirname, "sample-data/invoices.json");
    const invoiceData = fs.readFileSync(invoicesPath, "utf-8");
    const invoices: Invoice[] = JSON.parse(invoiceData);
    console.log(`  ✓ Loaded ${invoices.length} invoices\n`);

    const invA001 = invoices.find((i) => i.invoiceId === "INV-A-001");
    const invA003 = invoices.find((i) => i.invoiceId === "INV-A-003");

    if (!invA001 || !invA003) throw new Error("Sample invoices not found");

    const result1 = await runInvoice1(invA001);
    await applyHumanFix(invA001);
    const result2 = await runInvoice2(invA003);

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║   DEMO SUMMARY                                             ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("Step 1 (INV-A-001, no memory):");
    console.log(`  Corrections proposed: ${result1.corrections.length}`);
    console.log(`  Decision: ${result1.decision.decision}`);
    console.log(`  Confidence: ${(result1.decision.confidenceScore * 100).toFixed(1)}%\n`);

    console.log("Step 2 (Human approval):");
    console.log(`  Learned: Leistungsdatum → serviceDate`);
    console.log(`  Confidence: 0.30, Reinforced: 1x\n`);

    console.log("Step 3 (INV-A-003, with memory):");
    console.log(`  Corrections proposed: ${result2.corrections.length}`);
    console.log(`  Decision: ${result2.decision.decision}`);
    console.log(`  Confidence: ${(result2.decision.confidenceScore * 100).toFixed(1)}%\n`);

    console.log("✅ Demo completed successfully!\n");
  } catch (err) {
    console.error("[FATAL ERROR]", (err as Error).message);
    process.exit(1);
  }
}

runDemo().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
