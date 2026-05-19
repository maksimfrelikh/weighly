#!/usr/bin/env bash
# scale-admin §4.3 — scanner-rule tests for BUG-REG-034 Stream B.
#
# Asserts that the rules in `.gitleaks.toml` flag every fixture under
# `.gitleaks-tests/positive/` and flag NONE under `.gitleaks-tests/negative/`.
#
# Fixtures are copied to a temp directory before scanning so the global
# `paths = ['.gitleaks-tests/']` allowlist in `.gitleaks.toml` does not
# suppress findings during testing.
#
# Usage (from repo root):
#   ./scripts/test-secret-hook.sh
# Exit code:
#   0  — all rule tests passed
#   1  — at least one rule test failed
#   2  — gitleaks not installed

set -uo pipefail

repo_root="$(git rev-parse --show-toplevel)"
config="${repo_root}/.gitleaks.toml"
tests_dir="${repo_root}/.gitleaks-tests"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "test-secret-hook: gitleaks not on PATH. See $(basename "$0") header for install hints." >&2
  exit 2
fi

if [[ ! -f "$config" ]]; then
  echo "test-secret-hook: $config not found." >&2
  exit 2
fi

if [[ ! -d "${tests_dir}/positive" || ! -d "${tests_dir}/negative" ]]; then
  echo "test-secret-hook: ${tests_dir}/{positive,negative} not found." >&2
  exit 2
fi

tmp="$(mktemp -d -t scale-admin-gitleaks-tests.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

cp -r "${tests_dir}/positive" "${tmp}/positive"
cp -r "${tests_dir}/negative" "${tmp}/negative"

fail=0

# Positive fixtures: each MUST yield at least one finding.
echo "==> positive fixtures (each MUST be flagged)"
shopt -s nullglob
for f in "${tmp}"/positive/*; do
  name="$(basename "$f")"
  if gitleaks detect \
    --no-git \
    --no-banner \
    --redact \
    --config "$config" \
    --source "$f" \
    >/dev/null 2>&1; then
    echo "  FAIL  $name  (no finding)"
    fail=1
  else
    echo "  ok    $name"
  fi
done

# Negative fixtures: directory MUST be clean.
echo "==> negative fixtures (none must be flagged)"
neg_out="$(mktemp)"
if gitleaks detect \
  --no-git \
  --no-banner \
  --redact \
  --config "$config" \
  --source "${tmp}/negative" \
  >"$neg_out" 2>&1; then
  echo "  ok    .gitleaks-tests/negative (clean)"
else
  echo "  FAIL  .gitleaks-tests/negative produced findings:"
  sed 's/^/        /' "$neg_out"
  fail=1
fi
rm -f "$neg_out"

if (( fail == 0 )); then
  echo
  echo "test-secret-hook: ALL rule tests passed."
  exit 0
else
  echo
  echo "test-secret-hook: rule tests FAILED."
  exit 1
fi
