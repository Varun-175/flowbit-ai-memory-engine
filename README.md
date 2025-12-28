# Flowbit AI Memory Engine
**Learning‑Driven Invoice Correction System (Human‑in‑the‑Loop, Confidence‑Gated, Auditable)**

A memory-first learning layer for invoice processing pipelines.  
Invoices are assumed to be **pre-extracted** (no OCR focus). The system learns from **human-approved** corrections, stores reusable knowledge in **SQLite**, and recalls it safely on future invoices.

---

## Why this project
Traditional invoice pipelines treat every invoice as new. This engine adds a learning layer that:
- Learns from **approved** corrections (not guesses)
- Reuses vendor + pattern knowledge across invoices
- Prevents unsafe automation using **confidence gating**
- Keeps every decision explainable + auditable end-to-end

---

## Key objectives achieved
- Learn from human-approved corrections
- Reuse vendor-specific and pattern-based knowledge
- Prevent unsafe auto-corrections using confidence gating
- Maintain full auditability and explainability
- Persist memory across runs using SQLite
- Demonstrate learning clearly over time (**before → after**)

---

## Tech stack
- **Language:** TypeScript (strict)
- **Runtime:** Node.js
- **Persistence:** SQLite
- **Architecture:** Modular, phase-based learning pipeline

---

## Memory types implemented

### 1) Vendor Memory
Stores vendor-specific mappings from raw text keys to normalized fields.

Example:
- `Leistungsdatum → serviceDate`
- `Währung → currency`

Goal: normalize recurring vendor formats automatically.

---

### 2) Correction Memory
Stores reusable correction patterns learned by repetition + approval.

Implemented patterns:
- **VAT_INCLUDED** — VAT included in totals; recompute tax/gross correctly
- **FREIGHT_SKU** — shipping/freight line → SKU `FREIGHT`
- **SKONTO** — extract discount terms (Skonto) / recall known vendor habit

Each memory tracks:
- Confidence score
- Reinforcement count
- Usage count
- Last used timestamp

---

### 3) Resolution Memory
Tracks how discrepancies were resolved:
- Approved by human
- Reinforced existing memory
- Prevented contradictory learning

---

### 4) Duplicate Guard
Prevents learning from duplicate invoices:
- Same vendor
- Same invoice number
- Close dates

Duplicates are **always escalated** and **never used for learning**.

---

## Decision pipeline (Recall → Apply → Decide → Learn)

### Recall
- Fetch relevant vendor memory
- Fetch applicable correction patterns
- Detect duplicates

### Apply
- Propose corrections using recalled memory
- Assign confidence per suggestion
- Never mutates the invoice (suggest-only)

### Decide
- **AUTO_ACCEPT** → no corrections needed
- **ESCALATE** → low confidence, duplicate risk, or safety gating

> Auto-correction is intentionally gated for safety until memory proves reliable.

### Learn
- Reinforce memory only on **human approval**
- Confidence increases gradually (conservative)
- Prevents “bad memory domination” and contradictory learning

---

## Learning philosophy
- No ML training required
- Heuristic-based reinforcement with confidence decay/growth
- Conservative by design
- Human remains in control until memory proves reliable

---

## Demonstrated phases (Demo)

### Phase 1 — Duplicate Detection
- Detects duplicate invoices
- Blocks learning from duplicates

### Phase 2 — VAT Included (Parts AG)
- Detects VAT-included pricing
- Recomputes tax + gross totals
- Reinforces pattern after approval

### Phase 3 — Missing Currency Recovery
- Recovers currency from raw text
- Stores vendor-specific currency mapping

### Phase 4 — Freight SKU Mapping (Freight & Co)
- Maps freight/shipping descriptions → `FREIGHT` SKU
- Confidence increases with approvals

### Phase 5 — Skonto Discount Learning
- Detects Skonto terms
- Learns/reuses structured discount rules
- Reduces future flags for known patterns

Each phase shows:
- **Before learning**
- **Human approval**
- **After learning (improved recall/confidence)**

---

## Demo output contract
For every invoice, the engine produces:

{
"normalizedInvoice": { "...": "..." },
"proposedCorrections": [ "..." ],
"requiresHumanReview": true,
"reasoning": "Why memory was applied and why escalation happened",
"confidenceScore": 0.25,
"memoryUpdates": [ "..." ],
"auditTrail": [
{
"step": "recall | apply | decide | learn",
"timestamp": "...",
"details": "..."
}
]
}

text

---

## Persistence (SQLite)
Memory survives multiple runs via SQLite tables:
- `vendor_memory`
- `correction_memory`
- `resolution_memory`
- `audit_trail`
- `confidence_events`
- `duplicate_records`

---

## Running the demo

### 1) Install dependencies
npm install

text

### 2) Run demo
npm run demo

text

The demo script:
- Resets memory
- Seeds default patterns
- Runs all phases sequentially
- Prints aligned, readable logs
- Validates learning outcomes

---

## Why this design works
- **Explainable:** every decision includes reasoning
- **Safe:** low-confidence memory never auto-applies
- **Reusable:** knowledge compounds over time
- **Auditable:** full learning history is preserved
- **Production-oriented:** matches real document automation constraints

---

## Submission notes
This project fulfills the assignment outcomes:
- Learned memory
- Safe reuse
- Human-in-the-loop
- Confidence evolution
- Duplicate protection
- Clear before/after demonstration

---

## Author
**Varun A K**  
AI Agent Development Intern Candidate  
Flowbit Private Limited