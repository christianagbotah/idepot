# Integration Inventory

| Integration | Mechanism | Status in depot flows | Findings / target treatment |
|---|---|---|---|
| **Hubtel SMS** | `Sms_model::send_sms` — cURL `https://sms.hubtel.com/v1/messages/batch/simple/send`, Basic auth from `settings` (`hubtel_client_id/secret/sender`), Ghana number normalization `+233…` (`Sms_model.php:15-176`) | Invoked only on admin create/unblock (`Admin.php:240,354`), gated by `active_sms_service != disabled`; **no invoice/receipt SMS exists** | Live but narrowly used; secrets plaintext in `settings` echoed back into the form (`sms_settings.php:72-74`). Target: provider-interface notification service (SMS/email/push), secrets in vault, templates, opt-in per event (invoice, receipt, statement, dunning). |
| Hubtel vendor SDK | `libraries/hubtel-sms-api/` full `Hubtel\*` SDK + composer vendor | **Dead** — never required | Remove; keep single thin client |
| **Stripe** | `Stripe_model` + `libraries/Stripegateway.php` (`include('stripe/init.php')` — file absent) | **Dead** — never loaded | Remove; card payments, if needed, via new provider abstraction |
| **PayPal** | `Paypal_model` + `libraries/Paypal.php` | **Dead** — never loaded | Remove |
| **Barcode generation** | `Barcode_model::create_barcode` — Code39, PNG stream (`Barcode_model.php:20-70`); model loaded in constructor | **Dead** — never called | Target: real barcode/QR support (EAN-13/Code128/Qr) for label printing + scanning (see POS hardware doc) |
| **Iptracker / visitor_tracker** | `libraries/Iptracker.php` self-executes on autoload (`:70-71`), writes `visitor_tracker`, spoofable header IP, skips 'dimiyo' URLs | Live (runs every request), writes data nothing reads | Remove |
| **Email** | `email_model` (absent from snapshot; autoloaded) — account opening emails with plaintext password (`Admin.php:243`) | Live in production | Target: transactional email service; no secrets/PII in logs |
| **Mobile API** | `controllers/Mobile.php` — school-domain JSON API | **Dead for iDepot**; security liability (auth bypass, sha1 overwrites, unvalidated upload) | Remove entirely; new React Native apps use the versioned REST API |
| Payment gateways (MoMo etc.) | None in code — MoMo is manual (account rows + reference fields) | N/A | Target: payment-provider adapter layer (MoMo APIs e.g. MTN/Telecel/AT per client demand), reconciliation assistant |
| WhatsApp / USSD / Ghana-specific channels | None | N/A | Opportunity map (AI doc) |
| Frontend CMS | `Home.php` + `Frontend_model` (news/gallery/events/teachers) | Dead school remnant | Out of scope |

## Data flows crossing system boundaries today

1. **Pre-printed invoice/waybill booklets** — physical numbering imported via range generators (`generateInvoiceCodes/WaybillCodes`). Must remain importable.
2. **SMS credential delivery** — outbound only.
3. **Uploads** — `uploads/item_image/{id}.jpg`, `uploads/admin_image/{id}.jpg`, `uploads/school_logo.png` (no validation).
4. **Webmail link** — hardcoded `https://www.ghbuildersco.com:2096` in top bar (`top-header.php:50`) — customer-specific remnant to remove.
5. No webhooks, no scheduled external calls besides Hubtel SMS and dead freegeoip lookup in `Crud_model::create_log` (dead, table missing, plain HTTP).

## Target integration architecture

- `packages/contracts` event schemas; NestJS application services publish domain events to an outbox; a notification worker delivers SMS/email/push through provider interfaces (Hubtel first).
- Payment adapters behind `PaymentProviderPort` with per-tenant configuration; no vendor hard-coded into business logic (master prompt §8).
- OCR/document intelligence for supplier invoices and waybills via the Python AI service (human-confirmed before posting).
- All integration secrets in environment/secret store; per-tenant credentials encrypted at rest; rotation without redeploy.
