#!/usr/bin/env bash
# Table-driven check for scripts/ci-aggregate.sh.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
agg="$root/scripts/ci-aggregate.sh"
fail=0

check() {
  local name="$1"
  local want="$2"
  shift 2
  set +e
  bash "$agg" "$@" >/dev/null 2>&1
  local got=$?
  set -e
  if [ "$want" = pass ]; then
    if [ "$got" -eq 0 ]; then
      printf 'ok  %s\n' "$name"
    else
      printf 'FAIL %s: want pass got exit %s\n' "$name" "$got" >&2
      fail=1
    fi
  else
    if [ "$got" -ne 0 ]; then
      printf 'ok  %s\n' "$name"
    else
      printf 'FAIL %s: want fail got pass\n' "$name" >&2
      fail=1
    fi
  fi
}

check full-green pass full success success success
check web-green pass web success success skipped
check skip-green pass skip success skipped skipped
check shard-failed fail full success failure success
check shard-cancelled fail full success cancelled success
check shard-skipped-on-full fail full success skipped success
check bins-failed fail full failure skipped skipped
check load-failed fail full success success failure
check load-cancelled fail full success success cancelled
check web-shard-failed fail web success failure skipped
check web-load-ran fail web success success success
check skip-but-e2e-ran fail skip success success skipped
check unknown-mode fail nope success success success
check missing-args fail

exit "$fail"
