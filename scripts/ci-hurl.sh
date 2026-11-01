#!/usr/bin/env bash
# Install Hurl 8.0.1 onto PATH.
#
# The tarball is extracted under ${RUNNER_TEMP}/hurl-extract. Searching the
# whole temp directory races docker/containerd, which creates and removes
# containerd-mount directories while compose is starting.
# apt-get update runs only when libxml2 is not already installed.
# HURL_CACHE_DIR keeps the binary so the workflow can restore it next time.
set -euo pipefail

version=8.0.1
dest=/usr/local/bin/hurl
cache_dir="${HURL_CACHE_DIR:-${RUNNER_TEMP:-/tmp}/hurl-bin}"
mkdir -p "$cache_dir"

if [ ! -x "$cache_dir/hurl" ]; then
  extract="${RUNNER_TEMP:-/tmp}/hurl-extract"
  rm -rf "$extract"
  mkdir -p "$extract"
  curl -fsSL -o "$extract/hurl.tar.gz" \
    "https://github.com/Orange-OpenSource/hurl/releases/download/${version}/hurl-${version}-x86_64-unknown-linux-gnu.tar.gz"
  tar -xzf "$extract/hurl.tar.gz" -C "$extract"
  bin="$extract/hurl-${version}-x86_64-unknown-linux-gnu/bin/hurl"
  if [ ! -f "$bin" ]; then
    echo "hurl binary missing at $bin" >&2
    exit 1
  fi
  cp "$bin" "$cache_dir/hurl"
  chmod +x "$cache_dir/hurl"
fi

if dpkg -s libxml2-16 >/dev/null 2>&1; then
  echo "libxml2-16 already installed; skipping apt-get update"
elif dpkg -s libxml2 >/dev/null 2>&1; then
  echo "libxml2 already installed; skipping apt-get update"
else
  sudo apt-get update
  sudo apt-get install -y libxml2-16 || sudo apt-get install -y libxml2
fi
if [ ! -e /usr/lib/x86_64-linux-gnu/libxml2.so.2 ] && [ -e /usr/lib/x86_64-linux-gnu/libxml2.so.16 ]; then
  sudo ln -sf /usr/lib/x86_64-linux-gnu/libxml2.so.16 /usr/lib/x86_64-linux-gnu/libxml2.so.2
fi

sudo cp "$cache_dir/hurl" "$dest"
sudo chmod +x "$dest"
hurl --version
