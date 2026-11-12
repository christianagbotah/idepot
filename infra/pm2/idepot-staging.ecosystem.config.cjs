/**
 * PM2 ecosystem for iDepot staging (docs/staging/staging-runbook.md).
 *
 * Safety properties:
 *  - loopback-only binds (127.0.0.1) — the public edge is Webuzo's nginx vhost
 *    with TLS; nothing here is directly internet-reachable;
 *  - memory caps + restart policy tuned for a co-hosted VPS with exhausted
 *    swap (2026-11-12 inspection): api 512M, web 384M, restart on cap with
 *    backoff so an incident cannot squeeze neighbouring tenants;
 *  - structured log files WITH rotation from day one (the VPS disk is 90%
 *    full — unrotated logs are an outage waiting to happen);
 *  - env files live OUTSIDE the release tree (chmod 600, .env.api/.env.web in
 *    the app root) so a release flip never rewrites secrets.
 */
module.exports = {
  apps: [
    {
      name: 'idepot-staging-api',
      cwd: '/home/lightworld/webapps/idepot-staging/current/api',
      script: 'dist/main.js',
      instances: 1, // staging: 1 instance keeps memory bounded; scale deliberately
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '4311',
        HOST: '127.0.0.1',
      },
      dotenv: '/home/lightworld/webapps/idepot-staging/.env.api',
      out_file: '/home/lightworld/webapps/idepot-staging/logs/api-out.log',
      error_file: '/home/lightworld/webapps/idepot-staging/logs/api-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 250,
      min_uptime: '30s',
    },
    {
      name: 'idepot-staging-web',
      cwd: '/home/lightworld/webapps/idepot-staging/current/web',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
        PORT: '4310',
        HOSTNAME: '127.0.0.1',
      },
      dotenv: '/home/lightworld/webapps/idepot-staging/.env.web',
      out_file: '/home/lightworld/webapps/idepot-staging/logs/web-out.log',
      error_file: '/home/lightworld/webapps/idepot-staging/logs/web-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 250,
      min_uptime: '30s',
    },
  ],
};
