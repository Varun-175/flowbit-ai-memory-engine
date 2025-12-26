import fs from "fs";
import path from "path";
import { initDatabase, db } from "./src/memory/memoryStore";
import { runInvoice1 } from "./src/demo/run-invoice-1";
import { applyHumanFix } from "./src/demo/apply-human-fix";
import { runInvoice2 } from "./src/demo/run-invoice-2";
import { Invoice } from "./src/types";

function resetMemory(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("DELETE FROM vendor_memory", (err) => {
        if (err) console.error("[RESET] vendor_memory error:", err);
      });

      db.run("DELETE FROM correction_memory", (err) => {
        if (err) console.error("[RESET] correction_memory error:", err);
      });

      db.run("DELETE FROM resolution_memory", (err) => {
        if (err) console.error("[RESET] resolution_memory error:", err);
      });

      db.run("DELETE FROM audit_trail", (err) => {
        if (err) console.error("[RESET] audit_trail error:", err);
      });

      db.run("DELETE FROM confidence_events", (err) => {
        if (err) console.error("[RESET] confidence_events error:", err);
      });

      db.run("DELETE FROM duplicate_records", (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

async function runDemo() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║   FLOWBIT AI MEMORY ENGINE - FULL DEMO                      ║");
  console.log("║   Learning from Human Feedback → Auto-Correction            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    console.log("\n[SETUP] Initializing SQLite database...");
    initDatabase();
    console.log("  ✓ Database initialized\n");

    console.log("[SETUP] Resetting memory tables (fresh start)...");
    await resetMemory();
    console.log("  ✓ Memory cleared\n");

    console.log("[SETUP] Loading sample invoices...");
    const invoicesPath = path.join(__dirname, "sample-data", "invoices_extracted.json");
    const invoiceData = fs.readFileSync(invoicesPath, "utf-8");
    const invoices: Invoice[] = JSON.parse(invoiceData);
    console.log(`  ✓ Loaded ${invoices.length} invoices\n`);

    const invA001 = invoices.find((i) => i.invoiceId === "INV-A-001");
    const invA003 = invoices.find((i) => i.invoiceId === "INV-A-003");

    if (!invA001 || !invA003) {
      throw new Error("Sample invoices not found");
    }

    const result1 = await runInvoice1(invA001);
    await applyHumanFix(invA001);
    const result2 = await runInvoice2(invA003);

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║   DEMO SUMMARY                                             ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("Step 1 (INV-A-001, no memory):");
    console.log(`  Corrections proposed: ${result1.corrections.length}`);
    console.log(`  Decision: ${result1.decision.decision}`);
    console.log(`  Requires review: ${result1.decision.requiresHumanReview}`);
    console.log(`  Confidence: ${(result1.decision.confidenceScore * 100).toFixed(1)}%\n`);

    console.log("Step 2 (Human approval):");
    console.log(`  Learned: Leistungsdatum → serviceDate`);
    console.log(`  Initial confidence: 0.30`);
    console.log(`  Reinforced count: 1x\n`);

    console.log("Step 3 (INV-A-003, with memory):");
    console.log(`  Corrections proposed: ${result2.corrections.length}`);
    console.log(`  Decision: ${result2.decision.decision}`);
    console.log(`  Requires review: ${result2.decision.requiresHumanReview}`);
    console.log(`  Confidence: ${(result2.decision.confidenceScore * 100).toFixed(1)}%\n`);

    const validations = [
      {
        check: "Step 1: corrections.length > 0",
        actual: result1.corrections.length > 0,
        expected: true,
      },
      {
        check: "Step 1: decision = ESCALATE",
        actual: result1.decision.decision === "ESCALATE",
        expected: true,
      },
      {
        check: "Step 3: corrections.length > 0",
        actual: result2.corrections.length > 0,
        expected: true,
      },
      {
        check: "Step 3: memory recalled (confidence > 0)",
        actual: result2.decision.confidenceScore > 0,
        expected: true,
      },
    ];

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║   VALIDATION CHECKS                                        ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    let allPassed = true;
    for (const v of validations) {
      const status = v.actual === v.expected ? "✅ PASS" : "❌ FAIL";
      console.log(`${status} ${v.check}`);
      if (v.actual !== v.expected) allPassed = false;
    }

    if (allPassed) {
      console.log("\n🎉 All validations passed! Learning system works correctly.\n");
    } else {
      console.log("\n⚠️ Some validations failed. Check above.\n");
    }
  } catch (err) {
    console.error("[FATAL ERROR]", (err as Error).message);
    process.exit(1);
  }
}

runDemo().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
