# Cash Flow Statement — Canonical Method (Phase 4)

The Phase 4 cash flow statement uses the **indirect method**, derived
exclusively from the append-only journal (canonical accounting data). This
document is the authoritative method description (calculation-register C-30:
the legacy logic counted all POs as outflows and dropped deposits — neither
is reproduced). **Rebuilt from accounting first principles in the second
independent review round** (see the history note at the end).

## Definitions

- **Cash & cash equivalents** for this statement are:
  1. GL accounts mapped to the purposes `cash`, `bank_clearing`,
     `momo_clearing`, `cheque_clearing`; and
  2. every GL account referenced by a `bank_account` row (each concrete bank
     account's own GL account).
- **Window**: `[from, to]` on the journal business date (with
  `COALESCE(business_date, occurred_at::date)` so pre-Phase-4 rows classify
  correctly).
- Transfers between cash accounts are **net-zero by construction** and need
  no special handling (Dr one cash account / Cr another).

## Computation

The global ledger identity — every journal balances, so over ALL lines in
the window Σ(debits − credits) = 0 — gives an EXACT decomposition of the
cash movement:

```
cashΔ  =  netProfit  +  Σ_{non-cash balance-sheet accounts} (credit − debit)
```

The signed contribution `credit − debit` of each non-cash balance-sheet
account is its **cash effect**:

- an **asset** increase (debit-heavy) contributes NEGATIVE — growing AR,
  inventory or supplier advances consumed cash;
- a **liability** increase (credit-heavy) contributes POSITIVE — an unpaid
  GRN leaves inventory −100 on the asset side and GR/IR +100 on the
  liability side; both are working-capital movements inside operating
  activities and the report must show them with these signs (the previous
  implementation reversed the liability direction);
- an **equity** increase contributes POSITIVE — capital injections fund
  cash; distributions (debits) drain it.

`netProfit` is the same accrual figure the P&L reports over the identical
window (revenue − COGS − operating expenses + other income − other
expenses), computed from posted journals. P&L-class accounts are already
inside net profit and are excluded from the working-capital lines.

## Classification (IFRS-style)

| Activity | Contents | Presented total |
| --- | --- | --- |
| Operating | net profit + working-capital changes (AR, inventory, GR/IR, AP, customer deposits, supplier advances, tax controls, …) | `netCashFromOperations` |
| Investing | long-lived-asset accounts, designated by GL purpose (the seed chart has none — the section is honestly empty rather than fabricated) | `netCashFromInvesting` |
| Financing | the equity class: capital injections (positive), owner distributions (negative) | `netCashFromFinancing` |

Equity financing is **never** part of operating activities (the previous
implementation added it there). The statement reports:

```
netIncreaseDecreaseInCash = netCashFromOperations
                          + netCashFromInvesting
                          + netCashFromFinancing
```

plus `openingCashAndEquivalents` (Σ cash controls strictly before `from`)
and `closingCashAndEquivalents` = opening + net increase/decrease.

## Invariant (asserted by the statements service and the tests)

```
openingCashAndEquivalents + netIncreaseDecreaseInCash
    == direct Σ(debits − credits) over the cash accounts ≤ to
```

`closingCashAndEquivalents` is compared against the direct ledger figure
and any residual is exposed as **`unexplained`** — the integration suite
asserts it is exactly `0.0000` at every milestone of the 12-scenario
timeline. A non-zero value would mean the classification is incomplete; it
is surfaced, never plugged (no balancing adjustment is ever fabricated).

## Presentation

| Line | Source |
| --- | --- |
| Net profit | P&L over the window |
| Changes in operating assets | per-account `credit − debit` (negative = growth consumed cash) |
| Changes in operating liabilities | per-account `credit − debit` (positive = growth funded cash) |
| **Net cash from operating activities** | net profit + operating changes |
| Investing activities | purpose-designated asset accounts |
| **Net cash from investing activities** | sum |
| Financing activities | equity-class accounts |
| **Net cash from financing activities** | sum |
| **Net increase / decrease in cash** | operating + investing + financing |
| Cash & equivalents, opening / closing | direct ledger Σ before `from` / derived |
| Direct ledger movement (cash & bank controls) | Σ(debits − credits) in the window |
| Unexplained difference | MUST be zero — surfaced, never plugged |

## Rationale

- Accrual-consistent: starts from the same net profit the P&L reports.
- No document replay: pure GL aggregation — the statement cannot drift from
  the journals.
- Exact by identity, not by convention: the signs derive from Σ(D−C)=0, so
  the statement reconciles for ANY posting pattern, including reversing
  balances.
- Deposits, advances and GR/IR are working-capital lines (classified, never
  dropped — legacy defect D10-class).
- Fees and FX adjustments posted through cash accounts appear in both sides
  (inside expense/net profit and inside netCashMovement) and cancel exactly.

## History

- Phase 4 initial round: indirect method with
  `netCashFromOperations == netCashMovement` (equity folded into
  operations).
- Second independent review round: liability sign corrected
  (credit − debit for every non-cash balance-sheet account), explicit
  operating/investing/financing classification, opening/closing cash
  reported, closing reconciled both ways; pinned by the 12-scenario
  E2E timeline in `apps/api/test/financial-corrections.integration.test.ts`.
