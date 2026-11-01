#!/usr/bin/env bash
# After `cargo build` in bins, fail if a dirtied source is newer than the
# artifacts that list it. Cargo treats a 2020 mtime as older than a restored
# rlib, so a green build can still link a stale workspace crate. Dep-info
# left from that restore stays older than the source when the unit was not
# rebuilt. An orphan .d from an earlier hash does not fail the check when a
# newer artifact lists the same source.
#
# Reads the path list written by scripts/ci-dirty-rust.sh.
# An empty list passes. A source that no profile-root dep-info lists is
# not a compile input of the bins we just built (tests and hashed orphans
# under deps/ are ignored). Every listed artifact must be at least as new
# as the source: a relinked binary does not excuse a stale dependency rlib.
#
# Env:
#   CI_GUARD_ROOT    repo root (default: git toplevel)
#   CI_PROFILE       cargo profile directory under target/ (default: ci)
#   CI_DIRTIED_FILE  path list (default: $root/target/.ci-dirtied)
set -euo pipefail

if [ -n "${CI_GUARD_ROOT:-}" ]; then
  root="$CI_GUARD_ROOT"
else
  root="$(git rev-parse --show-toplevel)"
fi

profile="${CI_PROFILE:-ci}"
list="${CI_DIRTIED_FILE:-$root/target/.ci-dirtied}"

if [ ! -f "$list" ]; then
  echo "ci-guard-bins: missing $list" >&2
  exit 1
fi

exec python3 - "$root" "$root/target/$profile" "$list" << 'PY'
import os
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
profile = Path(sys.argv[2]).resolve()
listing = Path(sys.argv[3])

def split_make(text: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    i = 0
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text):
            buf.append(text[i + 1])
            i += 2
            continue
        if text[i].isspace():
            if buf:
                parts.append("".join(buf))
                buf = []
            i += 1
            continue
        buf.append(text[i])
        i += 1
    if buf:
        parts.append("".join(buf))
    return parts

def logical_lines(text: str) -> list[str]:
    lines: list[str] = []
    buf = ""
    for line in text.splitlines():
        if line.endswith("\\"):
            buf += line[:-1] + " "
        else:
            buf += line
            lines.append(buf)
            buf = ""
    if buf:
        lines.append(buf)
    return lines

dirtied: list[Path] = []
for raw in listing.read_text().splitlines():
    raw = raw.strip()
    if not raw:
        continue
    path = Path(raw)
    if not path.is_absolute():
        path = root / path
    dirtied.append(path.resolve())

if not dirtied:
    print("ci-guard-bins: no dirtied sources")
    sys.exit(0)

# Profile-root dep-info is the unit output (`libbraian_store.d`, `braian.d`).
# `deps/*.d` also records tests and old metadata hashes; those must not
# fail a `cargo build` that did not compile them.
d_files = list(profile.glob("*.d")) if profile.is_dir() else []
if not d_files:
    print(f"ci-guard-bins: no dep-info under {profile}", file=sys.stderr)
    sys.exit(1)

crate_dirs = []
crates = root / "crates"
if crates.is_dir():
    crate_dirs = [p.parent.resolve() for p in crates.glob("*/Cargo.toml")]

dirtied_set = set(dirtied)
artifacts: dict[Path, list[Path]] = {src: [] for src in dirtied_set}

def resolve_existing(path: Path) -> Path:
    try:
        return path.resolve()
    except OSError:
        return path

def dep_paths(dep: str) -> list[Path]:
    # `cargo build` from the workspace root writes workspace-relative paths
    # (`crates/store/src/lib.rs`). A package-relative path (`src/lib.rs`) is
    # used only when exactly one crate contains it, so two crates cannot
    # share one dep-info line.
    path = Path(dep)
    if path.is_absolute():
        return [resolve_existing(path)]
    direct = resolve_existing(root / dep)
    if direct.exists():
        return [direct]
    found = []
    for crate in crate_dirs:
        cand = resolve_existing(crate / dep)
        if cand.exists():
            found.append(cand)
    if len(found) == 1:
        return found
    return []

def artifact_paths(token: str) -> list[Path]:
    path = Path(token)
    options = [path] if path.is_absolute() else [root / token, profile / token, profile / "deps" / token]
    found = []
    for option in options:
        resolved = resolve_existing(option)
        if profile == resolved or profile in resolved.parents:
            found.append(resolved)
    return found

for dep_info in d_files:
    text = dep_info.read_text(errors="replace")
    for rule in logical_lines(text):
        if ":" not in rule:
            continue
        left, right = rule.split(":", 1)
        outputs = []
        for token in split_make(left):
            outputs.extend(artifact_paths(token))
        if not outputs:
            continue
        for dep in split_make(right):
            for cand in dep_paths(dep):
                if cand in artifacts:
                    artifacts[cand].extend(outputs)

fail = False
for src in sorted(dirtied_set, key=str):
    outputs = artifacts.get(src) or []
    if not outputs:
        continue
    if not src.exists():
        continue
    src_mtime = src.stat().st_mtime_ns
    seen = False
    for art in outputs:
        if not art.exists():
            print(f"ci-guard-bins: missing artifact {art} for {src}", file=sys.stderr)
            fail = True
            continue
        seen = True
        if art.stat().st_mtime_ns < src_mtime:
            print(f"ci-guard-bins: {art} is older than dirtied {src}", file=sys.stderr)
            fail = True
    if not seen and not fail:
        print(f"ci-guard-bins: missing artifacts for {src}", file=sys.stderr)
        fail = True

if fail:
    sys.exit(1)
print("ci-guard-bins: artifacts match the dirtied inputs")
PY
