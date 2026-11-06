# Security

Report security issues privately through this repository's GitHub security reporting feature when available. Otherwise, contact [grandimam on X](https://x.com/thegrandimam) to arrange a private channel. Do not put credentials, private exports, or exploitable details in a public issue.

## Intended deployment

- Public deployments serve a catalog; the processing system remains separate.
- Compose disables pipeline/admin API routes. Caddy independently blocks those routes.
- App and PostgreSQL host ports bind to localhost; Caddy publishes HTTP/HTTPS.
- Compose requires a database password. Setup scripts generate random credentials and retain existing ones.
- `.env`, datasets, exports, backups, and run logs remain outside Git and the Docker build context.
- Model adapters use existing local logins. Model credentials are not included in the web container.
- Imported research remains draft until it passes the separate review and publication process.

Keep your host, images, and dependencies updated. Back up the database separately and test restoration. Never upload a local backup or a pre-cleanup Git bundle to the public repository.
