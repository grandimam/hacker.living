#!/usr/bin/env bash
# Create local credentials without printing them or changing an existing setup.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$repo_dir"
if [[ -e .env ]]; then printf 'Existing .env retained.\n'; exit 0; fi
command -v openssl >/dev/null || { printf 'OpenSSL is required to generate credentials.\n' >&2; exit 1; }
# An existing database needs its existing password, never a replacement.
if command -v docker >/dev/null && docker volume inspect hacker-living_postgres_data >/dev/null 2>&1; then
  printf 'Existing database volume found. Restore its matching .env before starting.\n' >&2; exit 1
fi
umask 077
database_password=$(openssl rand -hex 24)
(set -o noclobber; printf 'APP_PORT=4317\nDATABASE_PORT=55432\nPOSTGRES_PASSWORD=%s\nDATABASE_URL=postgresql://hacker_living:%s@127.0.0.1:55432/hacker_living\n' "$database_password" "$database_password" > .env)
unset database_password
printf 'Created ignored .env with random database credentials.\n'
