#!/usr/bin/env bash
# Behaviour of scripts/ci-guard-bins.sh against a fake target/ci tree.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
guard="$root/scripts/ci-guard-bins.sh"
fail=0
dirs=()

cleanup() {
  local d
  for d in "${dirs[@]+"${dirs[@]}"}"; do
    rm -rf "$d"
  done
}
trap cleanup EXIT

new_tree() {
  local dir
  dir="$(mktemp -d)"
  dirs+=("$dir")
  mkdir -p "$dir/crates/store/src" "$dir/target/ci/deps"
  printf '[package]\nname = "store"\nversion = "0.0.0"\n' > "$dir/crates/store/Cargo.toml"
  printf 'fn lib() {}\n' > "$dir/crates/store/src/lib.rs"
  printf 'old\n' > "$dir/target/ci/deps/libstore.rlib"
  printf '%s\n' "$dir"
}

run_guard() {
  local dir="$1"
  CI_GUARD_ROOT="$dir" CI_PROFILE=ci bash "$guard"
}

expect_fail() {
  local name="$1"
  local dir="$2"
  set +e
  run_guard "$dir" >/dev/null 2>&1
  local code=$?
  set -e
  if [ "$code" -ne 0 ]; then
    printf 'ok  %s\n' "$name"
  else
    printf 'FAIL %s: guard passed\n' "$name" >&2
    fail=1
  fi
}

expect_pass() {
  local name="$1"
  local dir="$2"
  if run_guard "$dir" >/dev/null; then
    printf 'ok  %s\n' "$name"
  else
    printf 'FAIL %s: guard failed\n' "$name" >&2
    fail=1
  fi
}

# Restored rlib older than the dirtied source.
stale() {
  local dir
  dir="$(new_tree)"
  printf 'rlib\n' > "$dir/target/ci/libstore.rlib"
  touch -d '2020-01-01T00:00:00Z' "$dir/target/ci/libstore.rlib"
  touch "$dir/crates/store/src/lib.rs"
  cat > "$dir/target/ci/libstore.d" << EOF
$dir/target/ci/libstore.rlib: $dir/crates/store/src/lib.rs
EOF
  printf '%s\n' "$dir/crates/store/src/lib.rs" > "$dir/target/.ci-dirtied"
  expect_fail stale-rlib "$dir"
}

# Rebuild updates the artifact after the source was touched.
fresh() {
  local dir
  dir="$(new_tree)"
  printf 'rlib\n' > "$dir/target/ci/libstore.rlib"
  touch -d '2020-01-01T00:00:00Z' "$dir/crates/store/src/lib.rs"
  touch "$dir/target/ci/libstore.rlib"
  cat > "$dir/target/ci/libstore.d" << EOF
$dir/target/ci/libstore.rlib: crates/store/src/lib.rs
EOF
  printf '%s\n' "crates/store/src/lib.rs" > "$dir/target/.ci-dirtied"
  expect_pass rebuilt-rlib "$dir"
}

# A relinked binary is not enough when the dependency rlib stayed stale.
partial() {
  local dir
  dir="$(new_tree)"
  printf 'rlib\n' > "$dir/target/ci/libstore.rlib"
  printf 'bin\n' > "$dir/target/ci/braian"
  touch -d '2020-01-01T00:00:00Z' "$dir/target/ci/libstore.rlib"
  touch "$dir/crates/store/src/lib.rs"
  touch -d '2030-01-01T00:00:00Z' "$dir/target/ci/braian"
  cat > "$dir/target/ci/libstore.d" << EOF
$dir/target/ci/libstore.rlib: $dir/crates/store/src/lib.rs
EOF
  cat > "$dir/target/ci/braian.d" << EOF
$dir/target/ci/braian: $dir/crates/store/src/lib.rs
EOF
  printf '%s\n' "crates/store/src/lib.rs" > "$dir/target/.ci-dirtied"
  expect_fail stale-rlib-fresh-bin "$dir"
}

# Hashed dep-info under deps/ is not the unit output cargo links.
orphan() {
  local dir
  dir="$(new_tree)"
  printf 'old\n' > "$dir/target/ci/deps/libstore.rlib"
  printf 'new\n' > "$dir/target/ci/libstore.rlib"
  touch -d '2020-01-01T00:00:00Z' "$dir/target/ci/deps/libstore.rlib"
  touch "$dir/crates/store/src/lib.rs"
  touch -d '2030-01-01T00:00:00Z' "$dir/target/ci/libstore.rlib"
  cat > "$dir/target/ci/deps/libstore.d" << EOF
$dir/target/ci/deps/libstore.rlib: $dir/crates/store/src/lib.rs
EOF
  cat > "$dir/target/ci/libstore.d" << EOF
$dir/target/ci/libstore.rlib: $dir/crates/store/src/lib.rs
EOF
  printf '%s\n' "crates/store/src/lib.rs" > "$dir/target/.ci-dirtied"
  expect_pass deps-orphan-ignored "$dir"
}

# Package-relative dep-info paths (src/lib.rs) map through the crate root.
relative_dep() {
  local dir
  dir="$(new_tree)"
  printf 'rlib\n' > "$dir/target/ci/libstore.rlib"
  touch -d '2020-01-01T00:00:00Z' "$dir/target/ci/libstore.rlib"
  touch "$dir/crates/store/src/lib.rs"
  cat > "$dir/target/ci/libstore.d" << EOF
$dir/target/ci/libstore.rlib: src/lib.rs
EOF
  printf '%s\n' "crates/store/src/lib.rs" > "$dir/target/.ci-dirtied"
  expect_fail relative-dep-info "$dir"
}

# Another crate's src/lib.rs must not be treated as this crate's source.
scoped_dep() {
  local dir
  dir="$(new_tree)"
  mkdir -p "$dir/crates/other/src"
  printf '[package]\nname = "other"\nversion = "0.0.0"\n' > "$dir/crates/other/Cargo.toml"
  printf 'fn other() {}\n' > "$dir/crates/other/src/lib.rs"
  printf 'rlib\n' > "$dir/target/ci/libother.rlib"
  touch -d '2020-01-01T00:00:00Z' "$dir/target/ci/libother.rlib"
  touch "$dir/crates/store/src/lib.rs"
  cat > "$dir/target/ci/libother.d" << EOF
$dir/target/ci/libother.rlib: src/lib.rs
EOF
  printf '%s\n' "crates/store/src/lib.rs" > "$dir/target/.ci-dirtied"
  expect_pass other-crate-src "$dir"
}

# SQL that this profile does not compile is not a failure.
ignored() {
  local dir
  dir="$(new_tree)"
  mkdir -p "$dir/crates/store/migrations"
  printf 'select 1;\n' > "$dir/crates/store/migrations/V1.sql"
  touch "$dir/crates/store/migrations/V1.sql"
  printf 'rlib\n' > "$dir/target/ci/libstore.rlib"
  touch -d '2020-01-01T00:00:00Z' "$dir/target/ci/libstore.rlib"
  cat > "$dir/target/ci/libstore.d" << EOF
$dir/target/ci/libstore.rlib: $dir/crates/store/src/lib.rs
EOF
  printf '%s\n' "crates/store/migrations/V1.sql" > "$dir/target/.ci-dirtied"
  expect_pass not-a-compile-input "$dir"
}

empty_list() {
  local dir
  dir="$(new_tree)"
  : > "$dir/target/.ci-dirtied"
  expect_pass empty-list "$dir"
}

no_depinfo() {
  local dir
  dir="$(new_tree)"
  rm -rf "$dir/target/ci"
  mkdir -p "$dir/target/ci"
  printf '%s\n' "crates/store/src/lib.rs" > "$dir/target/.ci-dirtied"
  expect_fail missing-dep-info "$dir"
}

stale
fresh
partial
orphan
relative_dep
scoped_dep
ignored
empty_list
no_depinfo

if [ "$fail" -ne 0 ]; then
  exit 1
fi
printf 'ci-guard-bins: all cases passed\n'
