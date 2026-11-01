#!/usr/bin/env bash
# Exit 0 only when the required `stack` check should be green.
# A skipped shard is success only for the path filter (mode=skip), never
# because a dependency failed or the job was cancelled.
# Usage: ci-aggregate.sh <mode> <bins-result> <e2e-result> <load-result>
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: ci-aggregate.sh <mode> <bins> <e2e> <load>" >&2
  exit 1
fi

mode="$1"
bins="$2"
e2e="$3"
load="$4"

if [ "$bins" != success ]; then
  echo "bins result is ${bins}" >&2
  exit 1
fi

case "$mode" in
  skip)
    [ "$e2e" = skipped ] || { echo "e2e result is ${e2e}, want skipped" >&2; exit 1; }
    [ "$load" = skipped ] || { echo "load result is ${load}, want skipped" >&2; exit 1; }
    ;;
  web)
    [ "$e2e" = success ] || { echo "e2e result is ${e2e}" >&2; exit 1; }
    [ "$load" = skipped ] || { echo "load result is ${load}, want skipped" >&2; exit 1; }
    ;;
  full)
    [ "$e2e" = success ] || { echo "e2e result is ${e2e}" >&2; exit 1; }
    [ "$load" = success ] || { echo "load result is ${load}" >&2; exit 1; }
    ;;
  *)
    echo "unknown mode ${mode}" >&2
    exit 1
    ;;
esac
