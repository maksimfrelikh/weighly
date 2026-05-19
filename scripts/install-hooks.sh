#!/usr/bin/env bash
# scale-admin — one-time hook installer.
#
# Points git at the repo-tracked `.githooks/` directory so the pre-commit
# secret scanner (BUG-REG-034 Stream B) activates for every commit in this
# clone. Idempotent: safe to re-run.
#
# Usage (from repo root):
#   ./scripts/install-hooks.sh

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hooks_dir=".githooks"

if [[ ! -d "${repo_root}/${hooks_dir}" ]]; then
  echo "install-hooks: ${repo_root}/${hooks_dir} not found — run from the repo." >&2
  exit 1
fi

current="$(git -C "$repo_root" config --local --get core.hooksPath || true)"

if [[ "$current" == "$hooks_dir" ]]; then
  echo "install-hooks: core.hooksPath already set to '${hooks_dir}'."
else
  git -C "$repo_root" config --local core.hooksPath "$hooks_dir"
  echo "install-hooks: set core.hooksPath = '${hooks_dir}'."
fi

if command -v gitleaks >/dev/null 2>&1; then
  echo "install-hooks: gitleaks $(gitleaks version 2>/dev/null) detected — hook is active."
else
  cat <<'MSG'

install-hooks: gitleaks is NOT on PATH yet. The hook will block every commit
until gitleaks is installed:

  Ubuntu/Debian:  sudo apt-get install gitleaks
  macOS (brew):   brew install gitleaks
  Other:          https://github.com/gitleaks/gitleaks/releases

MSG
fi
