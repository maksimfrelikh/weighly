#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MONITORING_BASE_URL:-${1:-http://localhost:3000}}"
BASE_URL="${BASE_URL%/}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-10}"
CHECK_METRICS="${CHECK_METRICS:-1}"

require_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"

  if [[ "$haystack" != *"$needle"* ]]; then
    printf 'MONITORING_CHECK_FAIL=%s missing %s\n' "$label" "$needle" >&2
    exit 1
  fi
}

health_body="$(curl -fsS --max-time "$CURL_TIMEOUT_SECONDS" "$BASE_URL/api/health")"
require_contains "$health_body" '"status":"ok"' "health"
require_contains "$health_body" '"service":"scale-admin-backend"' "health"
printf 'MONITORING_HEALTH=PASS base_url=%s\n' "$BASE_URL"

if [[ "$CHECK_METRICS" == "1" ]]; then
  metrics_body="$(curl -fsS --max-time "$CURL_TIMEOUT_SECONDS" "$BASE_URL/api/metrics")"
  require_contains "$metrics_body" 'scale_admin_http_requests_total' "metrics"
  require_contains "$metrics_body" 'scale_admin_http_request_duration_seconds' "metrics"
  require_contains "$metrics_body" 'scale_admin_db_connections' "metrics"
  require_contains "$metrics_body" 'scale_admin_db_up' "metrics"
  printf 'MONITORING_METRICS=PASS base_url=%s\n' "$BASE_URL"
else
  printf 'MONITORING_METRICS=SKIP base_url=%s\n' "$BASE_URL"
fi
