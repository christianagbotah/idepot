# Security note for the legacy reference

The uploaded legacy archive contained hard-coded credentials and keys. This public reference package replaces identified database, SMTP, encryption, and Envato credentials with environment-variable placeholders.

Do **not** deploy this legacy package. It exists only for reverse-engineering business rules during the iDepot rebuild. Rotate all credentials that were present in the legacy archive before continuing production use.
