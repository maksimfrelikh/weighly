# MVP deployment notes

These notes describe the minimum production-oriented deployment posture for the Scale Admin MVP.

## Compose services and persistent data

The canonical `docker-compose.yml` defines:

- `postgres` (`postgres:18-alpine`) with the `postgres_data_18` volume mounted at `/var/lib/postgresql` (18+ keeps PGDATA under `<major>/docker` inside it). The pre-18 cluster is left behind in the old `postgres_data` volume: the move was a `pg_dump` → fresh 18 cluster → `psql` restore, and that volume can be removed once the new one has been trusted for a while.
- `backend` with `FILE_UPLOAD_DIR=/app/uploads`.
- `frontend` with `VITE_API_BASE_URL` pointing at the backend API origin.
- `scale_admin_uploads` mounted into the backend at `/app/uploads` for uploaded files.

Uploaded image records store `publicUrl` values such as `/uploads/images/<file>`. The backend serves `FILE_UPLOAD_DIR` through the `/uploads/` static prefix, so files in `/app/uploads/images` remain available at those URLs after container restarts when the `scale_admin_uploads` volume is retained.

## Required environment values

Use `backend/.env.example` as the variable checklist, but do not copy local sample secrets into production. Provide deployment-specific values for at least:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `FRONTEND_ORIGIN`
- `VITE_API_BASE_URL`
- session and CSRF cookie names/timeouts/rate limits when defaults are not appropriate
- `FILE_UPLOAD_DIR` when the upload path differs from `/app/uploads`

Keep real passwords, API tokens, TLS private keys, and generated credentials out of git.

## PostgreSQL backup before important changes

Before migrations, risky deploys, or manual data changes, create a PostgreSQL dump from the running Compose database:

```bash
mkdir -p backups
backup_file="backups/scale_admin_$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-scale_admin}" \
  -d "${POSTGRES_DB:-scale_admin}" \
  --format=custom \
  --file=/tmp/scale_admin.dump
docker compose cp postgres:/tmp/scale_admin.dump "$backup_file"
docker compose exec -T postgres rm -f /tmp/scale_admin.dump
```

Store the dump outside the server or in your normal backup location. Verify restore procedures periodically, for example with `pg_restore --list "$backup_file"`.

## Uploaded files backup before important changes

Before replacing containers, pruning Docker volumes, or migrating hosts, copy uploaded files from the persistent upload volume:

```bash
mkdir -p backups
backup_dir="backups/uploads_$(date +%Y%m%d-%H%M%S)"
container_id="$(docker compose ps -q backend)"
docker cp "$container_id:/app/uploads" "$backup_dir"
```

Alternatively, back up the Docker volume directly with a temporary helper container:

```bash
mkdir -p backups
backup_file="backups/scale_admin_uploads_$(date +%Y%m%d-%H%M%S).tar.gz"
docker run --rm \
  -v scale-admin_scale_admin_uploads:/uploads:ro \
  -v "$PWD/backups:/backup" \
  alpine sh -c 'cd /uploads && tar -czf /backup/uploads.tar.gz .'
mv backups/uploads.tar.gz "$backup_file"
```

Keep uploaded-file backups paired with database dumps from the same deployment window so `FileAsset.publicUrl` records and files stay consistent.

## HTTPS/TLS requirement

Production traffic must use HTTPS through a reverse proxy such as Caddy, Nginx, Traefik, or another explicit external TLS layer. Do not expose the MVP Compose ports directly to public users without TLS.

This is required for secure cookie behavior and for protecting authenticated admin sessions. Configure the reverse proxy to terminate TLS, forward requests to the frontend/backend services, and preserve the original host/protocol headers expected by your deployment.
