#!/usr/bin/env bash
# Dirty Rust inputs so a restored target/ cannot skip crates that changed
# after the commit that produced it.
#
# CI pins source mtimes to 2020-01-01, then Swatinem/rust-cache restores
# target/. That action's key does not include .rs sources, and an exact hit
# is not uploaded again, so the rlibs can come from an older main commit.
# Diffing only the PR base misses files that changed between that commit and
# the base (the braian-store rlib in PR 151).
#
# This reads the producer commit from target/.ci-src-sha (override with
# CI_SRC_SHA_FILE). That file is written by `stamp` after a successful build
# and is stored in the target cache. Every source under crates, docs/api,
# testdata, and a top-level migrations tree, plus the root manifests, that
# differs between the marker and HEAD is touched. If the marker is missing
# or that commit cannot be fetched, every one of those sources is touched.
#
# rust-cache deletes loose files in target/ before it uploads, so the marker
# survives only in the separate target cache saved after `stamp`.
#
# Usage:
#   scripts/ci-dirty-rust.sh         # touch stale sources
#   scripts/ci-dirty-rust.sh stamp   # record HEAD into the marker
#
# Env:
#   CI_DIRTY_ROOT     repo root (default: git toplevel)
#   CI_SRC_SHA_FILE   marker path (default: $root/target/.ci-src-sha)
#   CI_DIRTIED_FILE   list of paths touched (default: $root/target/.ci-dirtied)
#   CI_DIRTY_FETCH    set to 0 to skip git fetch (default: 1)
set -euo pipefail

root="${CI_DIRTY_ROOT:-$(git rev-parse --show-toplevel)}"
cd "$root"

marker="${CI_SRC_SHA_FILE:-$root/target/.ci-src-sha}"
list="${CI_DIRTIED_FILE:-$root/target/.ci-dirtied}"

if [ "${1:-}" = stamp ]; then
  mkdir -p "$(dirname "$marker")"
  git rev-parse HEAD > "$marker"
  exit 0
fi

if [ "${1:-}" != "" ]; then
  echo "ci-dirty-rust: unknown argument: $1" >&2
  exit 2
fi

mkdir -p "$(dirname "$list")"

write_all_sources() {
  : > "$list"
  local dirs=()
  local d
  for d in crates docs/api testdata migrations; do
    if [ -d "$d" ]; then
      dirs+=("$d")
    fi
  done
  if [ "${#dirs[@]}" -gt 0 ]; then
    find "${dirs[@]}" -type f -print >> "$list"
  fi
  local f
  for f in Cargo.toml Cargo.lock rust-toolchain.toml; do
    if [ -f "$f" ]; then
      printf '%s\n' "$f" >> "$list"
    fi
  done
  if [ -s "$list" ]; then
    sort -u "$list" -o "$list"
  fi
}

touch_listed() {
  if [ -s "$list" ]; then
    xargs -d $'\n' -r touch < "$list"
  fi
}

have_commit() {
  git cat-file -e "$1^{commit}" 2>/dev/null
}

sha=""
if [ -f "$marker" ]; then
  sha="$(head -n 1 "$marker" | tr -d '[:space:]')"
fi

if [ -z "$sha" ]; then
  write_all_sources
  touch_listed
  exit 0
fi

if ! have_commit "$sha"; then
  if [ "${CI_DIRTY_FETCH:-1}" != 0 ] && git remote get-url origin >/dev/null 2>&1; then
    GIT_TERMINAL_PROMPT=0 git fetch --no-tags --depth=1 origin "$sha" >/dev/null 2>&1 || true
  fi
fi

if ! have_commit "$sha"; then
  write_all_sources
  touch_listed
  exit 0
fi

diff_file="$(mktemp)"
git diff --no-ext-diff --diff-filter=d --name-only "$sha" HEAD -- \
  crates docs/api testdata migrations Cargo.toml Cargo.lock rust-toolchain.toml \
  > "$diff_file"
: > "$list"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ -e "$f" ]; then
    printf '%s\n' "$f" >> "$list"
  fi
done < "$diff_file"
rm -f "$diff_file"

if [ -s "$list" ]; then
  sort -u "$list" -o "$list"
fi
touch_listed
