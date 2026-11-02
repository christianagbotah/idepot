# Cash Flow Statement — Canonical Method (Phase 4)

The Phase 4 cash flow statement uses the **indirect method**, derived
exclusively from the append-only journal (canonical accounting data). This
document is the authoritative method description (calculation-register C-30:
the legacy logic counted all POs as outflows and dropped deposits — neither
is reproduced).

## Definitions

- **Cash accounts** for this statement are:
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

```
netCashFromOperations
  = netProfit                                  (accrual P&L over the window)
  + Σ changes in operating ASSETS              (presented as −Δ: an increase
        consumes cash)                          in AR/inventory consumes cash
  + Σ changes in operating LIABILITIES        (presented as +Δ)
  + Σ equity FINANCING movements               (capital injections positive,
                                                 distributions negative)
```

- `netProfit` is the same figure the P&L reports (revenue − COGS − operating
  expenses + other income − other expenses), computed from posted journals.
- Operating assets/liabilities are the `asset` / `liability` GL classes that
  are NOT cash accounts (AR, inventory, GR/IR, customer deposits, AP, tax
  payable, advances…).
- P&L-class accounts are already inside net profit and are excluded from the
  working-capital lines.
- Equity movements other than the current-period result are financing; they
  are classified explicitly (the service maps equity accounts; current
  earnings is inside net profit).

## Invariant (asserted by the statements service and the tests)

```
netCashFromOperations == netCashMovement
```

where `netCashMovement` = Σ (debits − credits) over the cash accounts in the
window. The report exposes the residual as **`unexplained`**; the
integration suite asserts it is exactly `0.0000`. A non-zero value would
mean the classification is incomplete — it is surfaced, never hidden.

## Presentation

| Line | Source |
| --- | --- |
| Net profit | P&L over the window |
| Changes in operating assets | per-account Δ (debit-normal, sign-flipped) |
| Changes in operating liabilities | per-account Δ |
| Equity financing | per-account Δ (credit-normal, sign-flipped) |
| **Net cash from operations** | sum of the above |
| Net cash movement (cash & bank controls) | direct sum over cash accounts |
| Unexplained difference | must be zero |

## Rationale

- Accrual-consistent: starts from the same net profit the P&L reports.
- No document replay: pure GL aggregation — the statement cannot drift from
  the journals.
- Deposits, advances and GR/IR are working-capital lines (classified, never
  dropped — legacy defect D10-class).
- Fees and FX adjustments posted through cash accounts appear in both sides
  (inside financing/expense and inside netCashMovement) and cancel exactly.
