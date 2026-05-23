# Monitoring and alerting baseline

This runbook is the safe baseline for BUG-REG-054. It documents the parts that
can be shipped in code and the parts that require explicit operator approval
because they create external monitors, alerts, or secrets.

## Shipped by the application

- Public health probe: GET /api/health.
- Prometheus-compatible metrics probe: GET /api/metrics.
- HTTP counters: scale_admin_http_requests_total with method, route, and status_code labels.
- HTTP latency histogram: scale_admin_http_request_duration_seconds with method, route, and status_code labels.
- PostgreSQL read-only connection gauges from pg_stat_activity and pg_settings:
  - scale_admin_db_up
  - scale_admin_db_connections by state plus total
  - scale_admin_db_max_connections
  - scale_admin_db_connection_utilization_ratio
- Process/runtime defaults from prom-client with the scale_admin_process_ prefix.

The metrics endpoint does not require a database write and does not expose
tokens, passwords, request bodies, cookies, query strings, or raw user input.
Dynamic URL segments are normalized before they become labels.

## Read-only verification

Use the local check script against a target that has this version deployed:

    MONITORING_BASE_URL=https://staging.maksimfrelikh.ru ./scripts/check-monitoring-targets.sh

For production before this PR is deployed there, health can be checked without
requiring the new metrics endpoint:

    CHECK_METRICS=0 MONITORING_BASE_URL=https://maksimfrelikh.ru ./scripts/check-monitoring-targets.sh

The script only performs HTTP GET requests. It does not install monitors,
change containers, touch the database, or send alerts.

## External uptime monitor

Requires explicit approval before activation.

Recommended settings:

- Provider: UptimeRobot or equivalent.
- Type: HTTPS monitor.
- URL: https://maksimfrelikh.ru/api/health.
- Interval: 5 minutes.
- Expected status: HTTP 200.
- Optional keyword: status.
- Alert contacts: Telegram contact configured in the provider UI.

Repeat for staging only if Maksim wants staging health alerts; otherwise use
production only to avoid noise.

## Telegram alerting

Requires explicit approval and secrets configured outside git.

Preferred low-risk setup:

1. Configure the provider-managed Telegram integration or webhook bridge.
2. Store bot tokens/webhook URLs only in the provider or host secret store.
3. Send a provider test alert to Telegram.
4. Record only the provider monitor ID and target URL in ops notes. Do not
   commit or paste webhook URLs, bot tokens, chat IDs, or alert payload secrets.

Target SLA for BUG-REG-054: alert visible in Telegram within 10 minutes of
production /api/health becoming unhealthy.

## Metrics scraping

Prometheus or Grafana can scrape:

    https://maksimfrelikh.ru/api/metrics

If the endpoint is exposed publicly through the reverse proxy, restrict access
by source IP at the proxy when a fixed scraper IP exists. If there is no stable
scraper IP, leave the endpoint public only after accepting that it exposes
aggregate operational metrics but no secrets.

## Deferred follow-ups

- Sentry or another error-tracking SDK for backend exceptions.
- Backup job success/failure alerts after BUG-REG-053 scheduling is approved.
- A dashboard for latency, error rate, and DB connection utilization.
