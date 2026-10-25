# Legacy iDepot source reference (sanitized)

This tree is a forensic reference copied from the deployed iDepot application on the Lightworld Technologies VPS on 2026-10-25.

Included: core controllers, models, helpers, application libraries, active nested depot/business views under `backend/admin/pages`, navigation, key backend layouts, and a small set of custom CSS/JS files.

Excluded: `node_modules`, vendor-heavy frontend assets, uploads, backups, full SQL dumps, credentials, secret-bearing production config, and the old top-level school-management view collection. Some school-era code may still exist inside shared controllers/models; z.ai must classify business relevance by active routes, nested depot views, models and schema usage.

Do not deploy this legacy tree. It exists only for reverse engineering, business-rule preservation, migration mapping and regression analysis.