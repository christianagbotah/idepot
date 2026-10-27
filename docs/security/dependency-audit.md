# Dependency & Secret Security Policy

**Scope:** CI security gates for the iDepot monorepo — dependency vulnerability auditing and secret scanning. This document defines the policy the gates enforce and records the triage of every finding that produced the current gate configuration.

**Gates (`.github/workflows/ci.yml`, job `security`):**

| Gate | Mechanism | Failure condition |
|---|---|---|
| Runtime dependency audit | `npm audit --omit=dev --audit-level=high` | any high/critical vulnerability in a **runtime** (production) dependency chain |
| Full dependency audit | `npm audit --audit-level=critical` | any **critical** vulnerability anywhere, including dev-only chains |
| Secret scanning | gitleaks v8.30.1 (pinned, sha256-verified), full git history, rules from `.gitleaks.toml` | any detected secret not covered by a documented allowlist entry |

Dev-only **high** findings do not hard-fail CI; they must instead be triaged to zero through the exception process below (each exception carries an owner and an expiry — a stale exception is a review finding, not a license to keep the vulnerability).

## Exception process (unavoidable temporary exceptions)

When no safe fixed version exists for a high/critical finding:

1. Record: package, advisory ID(s), exact dependency chain, severity, runtime vs development-only.
2. Assess actual exposure: is the vulnerable code path reachable in production, CI, or developer machines only?
3. Define a compensating control (e.g. vulnerable feature disabled, network-isolated execution, pinned lockfile).
4. Assign an owner and an expiry/remediation phase (ROADMAP phase or date).
5. Append the entry to the table in this document. Exceptions without an owner+expiry are invalid and the gate stays red.

## Triage — findings resolved on the Phase 1 branch (2026-10-27)

GitHub reported 8 vulnerabilities (2 moderate, 4 high, 2 critical) for PR #2's original lockfile. All were remediated with real version changes — **no exceptions were required**:

| # | Package | Advisory | Severity | Chain | Class | Resolution |
|---|---|---|---|---|---|---|
| 1 | tinypool ≤2.1.1 | GHSA-5gmw-xhrv-c9v3 (prototype pollution → RCE gadget) | critical | `vitest` → `tinypool` | development-only (test runner worker pool; never shipped) | vitest `^3.0.4` → `^4.1.12`; tinypool no longer present in the resolved tree |
| 2 | tinypool ≤2.1.1 | GHSA-85c8-ppgw-ccpr (prototype pollution in `run()` options) | critical | same as above | development-only | same as above |
| 3 | multer 2.0.0–2.4.0 | GHSA-q7qp-rjg7-q26m (DoS via pending async `fileFilter` after request teardown) | high | `@nestjs/platform-express` → `multer` (exact pin `2.4.0`) | **runtime** (API HTTP layer; multipart handling) | npm override `"multer": "^2.5.0"` → resolved 2.5.0 (security release, API-compatible within 2.x) |
| 4 | postcss ≤8.5.22 | GHSA-qx2v-qp2m-jg93 (XSS via unescaped `</style>` in stringify output) | high | `next` → `postcss` (exact pin `8.4.31`) | **runtime tree**, build-time execution (Next.js CSS pipeline) | npm override `"postcss": "^8.5.32"` → resolved 8.5.32 (patch-line of 8.x, API-compatible) |
| 5 | postcss ≤8.5.22 | GHSA-6g55-p6wh-862q (arbitrary file read via attacker-controlled `sourceMappingURL`) | high | same as above | same as above | same as above |
| 6 | postcss ≤8.5.22 | GHSA-fxqj-rqcc-2cmp (incomplete fix of GHSA-6g55-p6wh-862q) | high | same as above | same as above | same as above |
| 7 | postcss ≤8.5.22 | GHSA-r28c-9q8g-f849 (path traversal in source-map auto-loading) | high | same as above | same as above | same as above |
| 8 | zod <4.6.6 | GHSA-mrhx-c7xc-m3w5 (memory exhaustion validating oversized constrained collections) | high | direct dependency of `@idepot/contracts` | **runtime** (API request validation) | `zod` `^3.24.1` → `^4.6.7`; contracts code audited — only `z.object`/`z.string`/`safeParse`/`z.infer` used, no v3-only API |
| 9 | @vitest/mocker ≤4.1.11 | GHSA-82fw-gwwq-j7x9 (path traversal/arbitrary file read via mock redirect), GHSA-qxg6-89mg-rqv8 (code injection via manual mock registration) | moderate | `vitest` → `@vitest/mocker` | development-only | `@vitest/mocker` 4.1.12 via vitest `^4.1.12` |

Result: `npm audit` and `npm audit --omit=dev --audit-level=high` both report **0 vulnerabilities**.

### Upgrade risk notes

- **vitest 3 → 4** (dev-only): the shared `vitest.config.ts` (SWC transform, forks pool, aliases to package sources) was re-verified against vitest 4.1.12 by the full local suite run.
- **multer 2.4.0 → 2.5.0** (runtime): patch-level security release on the 2.x line; multipart APIs unchanged. Proven by the API integration suites.
- **postcss 8.4.31 → 8.5.32** (build-time): forced via override because Next.js pins postcss exactly. API-compatible 8.x patch line; proven by `next build` in CI.
- **zod 3 → 4** (runtime): the only direct consumer is `@idepot/contracts` (plus `parseBody`/change-feed schemas in the API), audited for v4 compatibility; proven by unit + integration suites.

## Secret-scan allowlist (`.gitleaks.toml`)

Every allowlist entry is deliberate and documented:

1. **`IDEPOT_JWT_SECRET: ci-secret-...` in `.github/workflows/ci.yml`** — fixed, public, CI-only HMAC key used to sign throwaway tokens inside ephemeral test databases on GitHub runners. Protects nothing; reproducibility requires a fixed value. Not a credential.
2. **Legacy Envato template token (redacted in-tree)** — a template-author Envato API personal token was found hardcoded in `legacy/source/_al01i/models/Crud_model.php` (missed by the Phase 0 sanitization pass that `legacy/SECURITY-NOTE.md` documents). Remediation on this branch: the token is replaced with `getenv("ENVATO_PERSONAL_TOKEN")`. The original value remains reachable in Phase 0 git history (commits `75a8793`..`64091ca`, predating this gate).
   - **Exposure assessment:** low. It is an Envato marketplace credential belonging to the original purchased template's author, duplicated verbatim across public copies of that CodeIgniter template; it grants no access to iDepot systems, data, or infrastructure, and the legacy tree is inert reference material that is never deployed.
   - **Compensating controls:** tree redaction (this branch); gitleaks gate now blocks re-introduction; history retention accepted rather than rewritten (Phase 0 is merged to main — a rewrite would invalidate every existing commit hash and open PR).
   - **Advisory:** if the Envato account is the repository owner's, rotate the token at envato.com regardless of the low assessment.

## Local reproduction

```
npm audit                                  # 0 vulnerabilities
npm audit --omit=dev --audit-level=high    # exit 0
gitleaks detect --source . --config .gitleaks.toml   # no leaks
```
