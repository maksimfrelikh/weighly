# `.gitleaks-tests/`

Fixtures and runner for the BUG-REG-034 Stream B secret-scanner rules
(`/.gitleaks.toml`). Driven by `scripts/test-secret-hook.sh`.

- `positive/` — files that **MUST** be flagged by gitleaks. Each fixture is
  scanned individually; the runner asserts at least one finding per file.
- `negative/` — files that **MUST NOT** be flagged. The whole directory is
  scanned in one pass; the runner asserts zero findings.

The runner copies fixtures into a temp directory before scanning so the
global `paths = ['.gitleaks-tests/']` allowlist in `.gitleaks.toml` (which
keeps fixture commits from firing the hook itself) does not suppress
findings during testing.

Strings inside fixtures are **synthetic** — generated locally for shape, not
associated with any real device, account, or service.
