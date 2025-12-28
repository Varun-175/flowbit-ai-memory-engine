// src/demo/apply-human-fix.ts (FULL COMPLETE UPGRADED WITH PHASES 2-5)
// - CASE 0: Phase 5 Skonto demo (INV-C-002) ✅ Change 3
// - CASE 1: Phase 4 Freight SKU (INV-C-001)
// - CASE 2: Phase 3 Currency (INV-B-003)
// - CASE 3: Phase 2 VAT (INV-B-001)
// - CASE 4: Phase 1 baseline (Supplier GmbH)

import { saveVendorMemory } from "../memory/vendorMemory";
import { recordResolution } from "../memory/resolutionMemory";
import { reinforceMemory, findVendorCorrections } from "../memory/correctionMemory";
import { Invoice, HumanCorrectionLog } from "../types";

export async function applyHumanFix(invoice: Invoice) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ APPLY HUMAN CORRECTION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    // =====================================================
    // CASE 0: Phase 5 Skonto demo (Freight & Co)  ✅ Change 3
    // INV-C-002: approve discountTerms extraction and reinforce SKONTO memory
    // =====================================================
    if (invoice.invoiceId === "INV-C-002") {
      const humanFeedback: HumanCorrectionLog = {
        invoiceId: invoice.invoiceId,
        vendor: invoice.vendor,
        corrections: [
          {
            field: "discountTerms",
            from: invoice.fields.discountTerms ?? null,
            to: "2% Skonto within 10 days",
            reason: "Skonto terms approved",
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
          "CORRECTION",
          c.field,
          true,
          0.1
        );
      }
      console.log("  ✓ Resolution recorded\n");

      console.log("[LEARN] Reinforcing SKONTO correction memory...");
      const vendorCorrections = await findVendorCorrections(invoice.vendor);
      const skontoMem = vendorCorrections.find((m) => m.pattern === "SKONTO");

      if (!skontoMem?.id) {
        throw new Error(
          `SKONTO correction memory not found for vendor "${invoice.vendor}". Did you seedDefaultCorrections()?`
        );
      }

      await reinforceMemory(skontoMem.id);
      console.log("  ✓ Reinforced: SKONTO\n");

      return;
    }

    // =====================================================
    // CASE 1: Phase 4 Freight SKU demo (Freight & Co)
    // INV-C-001: approve freight SKU correction
    // =====================================================
    if (invoice.invoiceId === "INV-C-001") {
      const humanFeedback: HumanCorrectionLog = {
        invoiceId: invoice.invoiceId,
        vendor: invoice.vendor,
        corrections: [
          {
            field: "lineItems[0].sku",
            from: invoice.fields.lineItems?.[0]?.sku ?? null,
            to: "FREIGHT",
            reason: "Freight description approved as SKU FREIGHT",
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
          "CORRECTION",
          c.field,
          true,
          0.1
        );
      }
      console.log("  ✓ Resolution recorded\n");

      console.log("[LEARN] Reinforcing FREIGHT_SKU correction memory...");
      const vendorCorrections = await findVendorCorrections(invoice.vendor);
      const freightMem = vendorCorrections.find((m) => m.pattern === "FREIGHT_SKU");

      if (!freightMem?.id) {
        throw new Error(
          `FREIGHT_SKU correction memory not found for vendor "${invoice.vendor}". Did you seedDefaultCorrections()?`
        );
      }

      await reinforceMemory(freightMem.id);
      console.log("  ✓ Reinforced: FREIGHT_SKU\n");

      return;
    }

    // =====================================================
    // CASE 2: Phase 3 Currency Recovery demo (Parts AG)
    // INV-B-003: approve currency correction and store vendor memory
    // =====================================================
    if (invoice.invoiceId === "INV-B-003") {
      const humanFeedback: HumanCorrectionLog = {
        invoiceId: invoice.invoiceId,
        vendor: invoice.vendor,
        corrections: [
          {
            field: "currency",
            from: invoice.fields.currency ?? null,
            to: "EUR",
            reason: "Currency confirmed from raw text (Währung: EUR)",
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

      console.log("[LEARN] Storing vendor mapping (currency recovery)...");
      await saveVendorMemory({
        vendor: invoice.vendor,
        sourceKey: "Währung",
        targetField: "currency",
        confidence: 0.25,
        usageCount: 0,
        reinforcedCount: 1,
        rejectedCount: 0,
      });
      console.log("  ✓ Stored: Währung → currency (confidence: 0.25, reinforced 1x)\n");

      return;
    }

    // =====================================================
    // CASE 3: Phase 2 VAT demo (Parts AG)
    // INV-B-001: approve VAT corrections so VAT_INCLUDED gets reinforced.
    // =====================================================
    if (invoice.invoiceId === "INV-B-001") {
      const net = invoice.fields.netTotal;
      const rate = invoice.fields.taxRate ?? 0.19;

      if (net == null) {
        throw new Error(
          "INV-B-001 netTotal is null; update applyHumanFix to approve gross->net reverse VAT path instead."
        );
      }

      const correctedTax = +(net * rate).toFixed(2);
      const correctedGross = +(net + correctedTax).toFixed(2);

      const humanFeedback: HumanCorrectionLog = {
        invoiceId: invoice.invoiceId,
        vendor: invoice.vendor,
        corrections: [
          {
            field: "taxTotal",
            from: invoice.fields.taxTotal ?? null,
            to: correctedTax,
            reason: "Prices incl. VAT / MwSt. inkl. detected — tax recalculated from netTotal",
          },
          {
            field: "grossTotal",
            from: invoice.fields.grossTotal ?? null,
            to: correctedGross,
            reason: "Prices incl. VAT / MwSt. inkl. detected — gross recomputed",
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
          "CORRECTION",
          c.field,
          true,
          0.1
        );
      }
      console.log("  ✓ Resolution recorded\n");

      console.log("[LEARN] Reinforcing VAT_INCLUDED correction memory...");
      const vendorCorrections = await findVendorCorrections(invoice.vendor);
      const vatMem = vendorCorrections.find((m) => m.pattern === "VAT_INCLUDED");

      if (!vatMem?.id) {
        throw new Error(
          `VAT_INCLUDED correction memory not found for vendor "${invoice.vendor}". Did you seedDefaultCorrections() AFTER resetMemory()?`
        );
      }

      await reinforceMemory(vatMem.id);
      console.log("  ✓ Reinforced: VAT_INCLUDED\n");

      return;
    }

    // =====================================================
    // CASE 4: Existing baseline demo (Supplier GmbH)
    // =====================================================
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
      await recordResolution(invoice.invoiceId, invoice.vendor, "VENDOR", c.field, true, 0.1);
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
