#!/usr/bin/env bash
# Run from a checkout: sudo bash scripts/setup-aws.sh [--domain hacker.living]
set -euo pipefail
trap 'printf "Setup stopped at line %s. Existing data and credentials are retained.\n" "$LINENO" >&2' ERR

usage() {
  cat <<'HELP'
Usage: sudo bash scripts/setup-aws.sh [--domain hacker.living]
Installs Docker, Compose, Buildx, Git, and utilities on Ubuntu or Amazon Linux 2023.
Creates .env only when missing, enables the public HTTPS proxy, and leaves startup to you.
Requires x86_64 Linux. Reconnect SSH after setup to activate Docker group membership.
HELP
}
site_domain=hacker.living
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) [[ $# -ge 2 ]] || { usage; exit 1; }; site_domain=$2; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
done
if [[ ! "$site_domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ "$site_domain" != *.* ]]; then
  printf 'Supply a domain name, for example hacker.living.\n' >&2; exit 1
fi
[[ "$(uname -s)" == Linux ]] || { printf 'Run this on your AWS Linux instance.\n' >&2; exit 1; }
[[ "$(uname -m)" == x86_64 ]] || { printf 'Use an x86_64 instance such as t3.large; the current PostGIS image is amd64.\n' >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || { printf 'Run with sudo: sudo bash scripts/setup-aws.sh\n' >&2; exit 1; }
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ -f "$repo_dir/compose.yaml" && -f "$repo_dir/Caddyfile" ]] || { printf 'Run this script from the complete hacker.living checkout.\n' >&2; exit 1; }
login_user=${SUDO_USER:-root}
# shellcheck source=/dev/null
. /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:22.04|ubuntu:24.04|ubuntu:26.04|ubuntu:26.10) ;;
  amzn:2023) ;;
  *) printf 'Supported: Ubuntu 22.04/24.04/26.04/26.10 or Amazon Linux 2023. Detected: %s %s\n' "${ID:-unknown}" "${VERSION_ID:-unknown}" >&2; exit 1 ;;
esac
export DEBIAN_FRONTEND=noninteractive
printf 'Installing prerequisites for %s %s...\n' "$ID" "$VERSION_ID"

# Download only Docker's official releases and verify the published SHA-256 checksum.
install_release_plugin() {
  local repository=$1 plugin=$2 tag asset base download_dir expected
  download_dir=$(mktemp -d)
  tag=$(curl -fsSL --retry 3 --connect-timeout 15 --max-time 120 "https://api.github.com/repos/docker/$repository/releases/latest" | jq -er '.tag_name')
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { printf 'Invalid Docker release tag.\n' >&2; return 1; }
  base="https://github.com/docker/$repository/releases/download/$tag"
  if [[ "$repository" == compose ]]; then
    asset=docker-compose-linux-x86_64
    curl -fsSL --retry 3 --connect-timeout 15 --max-time 300 "$base/$asset.sha256" -o "$download_dir/checksums"
    expected=$(awk 'NR==1{print $1}' "$download_dir/checksums")
  else
    asset="buildx-$tag.linux-amd64"
    curl -fsSL --retry 3 --connect-timeout 15 --max-time 300 "$base/checksums.txt" -o "$download_dir/checksums"
    expected=$(awk -v file="$asset" '$2==file || $2=="*"file {print $1}' "$download_dir/checksums")
  fi
  [[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] || { printf 'Missing release checksum for %s.\n' "$asset" >&2; return 1; }
  curl -fsSL --retry 3 --connect-timeout 15 --max-time 300 "$base/$asset" -o "$download_dir/$asset"
  printf '%s  %s\n' "$expected" "$download_dir/$asset" | sha256sum --check --status
  install -d -m 0755 /usr/local/lib/docker/cli-plugins
  install -m 0755 "$download_dir/$asset" "/usr/local/lib/docker/cli-plugins/$plugin"
  rm -f -- "$download_dir/$asset" "$download_dir/checksums"
  rmdir -- "$download_dir"
}

if [[ "$ID" == ubuntu ]]; then
  apt-get update
  apt-get install -y ca-certificates curl git openssl jq
  if ! command -v docker >/dev/null 2>&1; then
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL --retry 3 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    printf 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "${UBUNTU_CODENAME:-$VERSION_CODENAME}" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
else
  dnf install -y docker git openssl jq ca-certificates
  if ! command -v curl >/dev/null 2>&1; then dnf install -y curl; fi
fi
if ! docker compose version >/dev/null 2>&1; then install_release_plugin compose docker-compose; fi
if ! docker buildx version >/dev/null 2>&1; then install_release_plugin buildx docker-buildx; fi
systemctl enable --now docker
if [[ "$login_user" != root ]]; then
  getent group docker >/dev/null || groupadd docker
  usermod -aG docker "$login_user"
fi

cd -- "$repo_dir"
umask 077
if [[ ! -e .env ]]; then
  database_password=$(openssl rand -hex 24)
  # Refuse to guess credentials for a database volume that already exists.
  if docker volume inspect hacker-living_postgres_data >/dev/null 2>&1; then
    printf 'An existing database volume was found without .env. Restore its credentials first; setup has not changed the database.\n' >&2
    exit 1
  fi
  (set -o noclobber; printf 'DATABASE_PORT=55432\nAPP_PORT=4317\nPOSTGRES_PASSWORD=%s\nDATABASE_URL=postgresql://hacker_living:%s@127.0.0.1:55432/hacker_living\n' "$database_password" "$database_password" > .env)
  unset database_password
  printf 'Created .env with random database credentials.\n'
else
  printf 'Existing .env and database credentials retained.\n'
fi
# Append missing settings without sourcing .env as shell code or overwriting values.
if ! grep -Eq '^COMPOSE_PROFILES=' .env; then printf '\nCOMPOSE_PROFILES=public\n' >> .env; fi
if ! grep -Eq '^SITE_ADDRESS=' .env; then printf 'SITE_ADDRESS=%s\n' "$site_domain" >> .env; fi
chmod 0600 .env
if [[ "$login_user" != root ]]; then chown "$login_user:$(id -gn "$login_user")" .env; fi

docker compose config --quiet
docker --version
docker compose version
docker buildx version
docker info --format 'Docker server: {{.ServerVersion}}'
printf '\nSetup complete. No app containers or processing workers were started.\n'
printf 'Reconnect SSH to activate Docker group membership (Docker access permits host administration).\n'
printf 'Then run from %s:\n\n  docker compose up --build -d --wait\n\n' "$repo_dir"
printf 'Point the SITE_ADDRESS domain in .env to this instance and allow inbound TCP 80/443 in its security group.\n'
printf 'Caddy will request HTTPS after DNS resolves. PostgreSQL and the app port remain bound to localhost.\n'
printf 'A fresh database is empty; transfer your catalog separately.\n'
