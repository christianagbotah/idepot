# Legacy artifact handoff

The original uploaded `idepot.zip` is **not safe to publish** in this public repository. The audit found hard-coded legacy credentials/keys and real staff/supplier/session data in the source/database material.

A sanitized legacy source bundle and a further-sanitized first-10-row database sample were prepared for the modernization audit. Before z.ai begins full source tracing, place them at these exact paths:

- `legacy/idepot_legacy_reference_sanitized.tar.xz`
- `legacy/depot1_db_public_sanitized_first10.sql`

The source bundle preserves the active depot controllers/models/business page tree/navigation while excluding `node_modules`, most vendor noise, obvious school-management top-level views and identified secrets. The SQL sample keeps legacy IDs/document codes/dates/quantities/financial figures needed for reconciliation analysis while anonymizing customers, staff/admins, suppliers, sessions, visitor data and integration-identifying settings.

Do not substitute the original unsanitized archive in this public repository. Rotate any legacy credentials that were present in the uploaded source before continuing production use.

The modernization instructions are in `/ZAI_IDEPOT_MODERNIZATION_MASTER_PROMPT.md`, and the classification guidance is in `/legacy/legacy-view-inventory.md`.
