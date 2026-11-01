#!/usr/bin/env bash
# The hurl installer must not scan /tmp. Run 41265846363 failed because
# `find /tmp -name hurl` raced with containerd mounts.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
if grep -nE 'find[[:space:]]+/tmp' "$root/scripts/ci-hurl.sh" "$root/.github/workflows/ci.yml"; then
  echo "FAIL hurl install searches /tmp" >&2
  fail=1
else
  echo "ok  hurl install does not search /tmp"
fi
if ! grep -q 'hurl-extract' "$root/scripts/ci-hurl.sh"; then
  echo "FAIL hurl install has no private extract directory" >&2
  fail=1
else
  echo "ok  hurl extract directory"
fi
if ! grep -q 'libxml2-16 already installed' "$root/scripts/ci-hurl.sh"; then
  echo "FAIL hurl install does not skip apt-get update" >&2
  fail=1
else
  echo "ok  apt-get update skipped when libxml2-16 is installed"
fi
exit "$fail"
