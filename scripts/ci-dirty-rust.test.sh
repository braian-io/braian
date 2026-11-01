#!/usr/bin/env bash
# Behaviour of scripts/ci-dirty-rust.sh.
# A cache commit, a later base commit that edits crate A, and HEAD that
# edits crate B must dirty both A and B. A missing or unknown marker
# dirties every Rust input and leaves unrelated files alone.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/scripts/ci-dirty-rust.sh"
pin_time='2020-01-01T00:00:00Z'
pin="$(date -d "$pin_time" +%s)"
fail=0
repos=()

cleanup() {
  local r
  for r in "${repos[@]+"${repos[@]}"}"; do
    rm -rf "$r"
  done
}
trap cleanup EXIT

mtime() {
  stat -c %Y "$1"
}

assert_new() {
  local name="$1"
  local path="$2"
  if [ "$(mtime "$path")" -gt "$pin" ]; then
    return 0
  fi
  printf 'FAIL %s: %s was not dirtied\n' "$name" "$path" >&2
  fail=1
}

assert_pinned() {
  local name="$1"
  local path="$2"
  if [ "$(mtime "$path")" -eq "$pin" ]; then
    return 0
  fi
  printf 'FAIL %s: %s mtime changed\n' "$name" "$path" >&2
  fail=1
}

new_repo() {
  local repo
  repo="$(mktemp -d)"
  repos+=("$repo")
  git -C "$repo" init -q -b main
  git -C "$repo" config user.email test@example.com
  git -C "$repo" config user.name test
  mkdir -p \
    "$repo/crates/a/src" \
    "$repo/crates/b/src" \
    "$repo/crates/c/src" \
    "$repo/docs/api" \
    "$repo/testdata" \
    "$repo/migrations"
  printf 'a1\n' > "$repo/crates/a/src/lib.rs"
  printf 'b1\n' > "$repo/crates/b/src/lib.rs"
  printf 'c1\n' > "$repo/crates/c/src/lib.rs"
  printf '{}\n' > "$repo/docs/api/openapi.json"
  printf 't\n' > "$repo/testdata/demo.txt"
  printf 'sql\n' > "$repo/migrations/V1.sql"
  printf 'manifest\n' > "$repo/Cargo.toml"
  printf 'lock\n' > "$repo/Cargo.lock"
  printf 'toolchain\n' > "$repo/rust-toolchain.toml"
  printf 'readme\n' > "$repo/README.md"
  git -C "$repo" add .
  git -C "$repo" commit -q -m cache
  printf '%s\n' "$repo"
}

keep() {
  repos+=("$1")
}

pin_tree() {
  local repo="$1"
  find "$repo/crates" "$repo/docs" "$repo/testdata" "$repo/migrations" \
    "$repo/Cargo.toml" "$repo/Cargo.lock" "$repo/rust-toolchain.toml" \
    "$repo/README.md" -exec touch -d "$pin_time" {} +
}

run_dirty() {
  local repo="$1"
  CI_DIRTY_ROOT="$repo" CI_DIRTY_FETCH="${2:-0}" bash "$script"
}

# Cache commit, base edits crate A, HEAD edits crate B.
cache_case() {
  local repo cache_sha
  repo="$(new_repo)"
  keep "$repo"
  cache_sha="$(git -C "$repo" rev-parse HEAD)"
  printf 'a2\n' > "$repo/crates/a/src/lib.rs"
  git -C "$repo" commit -q -am base
  printf 'b2\n' > "$repo/crates/b/src/lib.rs"
  git -C "$repo" commit -q -am head
  mkdir -p "$repo/target"
  printf '%s\n' "$cache_sha" > "$repo/target/.ci-src-sha"
  pin_tree "$repo"
  run_dirty "$repo" 0
  assert_new cache-span "$repo/crates/a/src/lib.rs"
  assert_new cache-span "$repo/crates/b/src/lib.rs"
  assert_pinned cache-span "$repo/crates/c/src/lib.rs"
  assert_pinned cache-span "$repo/docs/api/openapi.json"
  assert_pinned cache-span "$repo/testdata/demo.txt"
  assert_pinned cache-span "$repo/migrations/V1.sql"
  assert_pinned cache-span "$repo/Cargo.toml"
  assert_pinned cache-span "$repo/README.md"
  if [ "$fail" -eq 0 ]; then
    printf 'ok  cache commit dirties both later crates\n'
  fi
}

# Marker at the base commit dirties only what HEAD changed after that.
base_marker_case() {
  local repo base_sha
  repo="$(new_repo)"
  keep "$repo"
  printf 'a2\n' > "$repo/crates/a/src/lib.rs"
  git -C "$repo" commit -q -am base
  base_sha="$(git -C "$repo" rev-parse HEAD)"
  printf 'b2\n' > "$repo/crates/b/src/lib.rs"
  git -C "$repo" commit -q -am head
  mkdir -p "$repo/target"
  printf '%s\n' "$base_sha" > "$repo/target/.ci-src-sha"
  pin_tree "$repo"
  run_dirty "$repo" 0
  assert_pinned base-marker "$repo/crates/a/src/lib.rs"
  assert_new base-marker "$repo/crates/b/src/lib.rs"
  assert_pinned base-marker "$repo/crates/c/src/lib.rs"
  if [ "$fail" -eq 0 ]; then
    printf 'ok  marker at base dirties only HEAD\n'
  fi
}

expect_full() {
  local name="$1"
  local repo="$2"
  assert_new "$name" "$repo/crates/a/src/lib.rs"
  assert_new "$name" "$repo/crates/b/src/lib.rs"
  assert_new "$name" "$repo/crates/c/src/lib.rs"
  assert_new "$name" "$repo/docs/api/openapi.json"
  assert_new "$name" "$repo/testdata/demo.txt"
  assert_new "$name" "$repo/migrations/V1.sql"
  assert_new "$name" "$repo/Cargo.toml"
  assert_new "$name" "$repo/Cargo.lock"
  assert_new "$name" "$repo/rust-toolchain.toml"
  assert_pinned "$name" "$repo/README.md"
}

missing_case() {
  local repo
  repo="$(new_repo)"
  keep "$repo"
  pin_tree "$repo"
  rm -f "$repo/target/.ci-src-sha"
  run_dirty "$repo" 0
  expect_full missing "$repo"
  if [ "$fail" -eq 0 ]; then
    printf 'ok  missing marker dirties every Rust input\n'
  fi
}

unknown_case() {
  local repo
  repo="$(new_repo)"
  keep "$repo"
  mkdir -p "$repo/target"
  printf '0123456789abcdef0123456789abcdef01234567\n' > "$repo/target/.ci-src-sha"
  pin_tree "$repo"
  run_dirty "$repo" 0
  expect_full unknown "$repo"
  if [ "$fail" -eq 0 ]; then
    printf 'ok  unknown marker dirties every Rust input\n'
  fi
}

# A marker that cannot be fetched behaves like a missing one.
fetch_fail_case() {
  local repo
  repo="$(new_repo)"
  keep "$repo"
  git -C "$repo" remote add origin "$repo/not-a-remote"
  mkdir -p "$repo/target"
  printf '0123456789abcdef0123456789abcdef01234567\n' > "$repo/target/.ci-src-sha"
  pin_tree "$repo"
  run_dirty "$repo" 1
  expect_full fetch-fail "$repo"
  if [ "$fail" -eq 0 ]; then
    printf 'ok  unfetchable marker dirties every Rust input\n'
  fi
}

cache_case
base_marker_case
missing_case
unknown_case
fetch_fail_case

if [ "$fail" -ne 0 ]; then
  exit 1
fi
printf 'ci-dirty-rust: all cases passed\n'
