# GCE release runtime

This directory is the production Compose definition used by `.github/workflows/deploy-gce.yml`.
It is copied to `$HOME/workflow-platform` on the target GCE VM only during a manually approved release.

## Prerequisites on the GCE VM

- Docker Engine with the Docker Compose plugin is installed.
- The deploy identity can run `docker`, write to `$HOME/workflow-platform`, and use `gcloud compute ssh` through the configured IAM/OS Login policy.
- The VM service account has `roles/artifactregistry.reader` for the target Artifact Registry repository, and Docker credential helper access to `${GAR_LOCATION}-docker.pkg.dev` has been configured on the VM.
- `/etc/workflow-platform/api.env` exists, is owned by root, and is readable only by the account that runs Docker.
- PostgreSQL, Redis, and, when `VECTOR_STORE=qdrant`, Qdrant are reachable from the VM using the connection values in `api.env`.
- A reverse proxy or load balancer terminates TLS and proxies the public web/API domains to `127.0.0.1:3000` and `127.0.0.1:4000`.

## Required `/etc/workflow-platform/api.env` values

```dotenv
PORT=4000
WEB_BASE_URL=https://app.example.com
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
VECTOR_STORE=qdrant
QDRANT_URL=http://...
QDRANT_COLLECTION=agent_memory
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
REFRESH_TOKEN_PEPPER=replace-with-a-different-long-random-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
REFRESH_TOKEN_ABSOLUTE_TTL=90d
COOKIE_DOMAIN=app.example.com
COOKIE_SECURE=true
```

Do not commit this file or copy it into GitHub Actions. The workflow receives only registry, VM, and Workload Identity configuration from GitHub.

## GitHub Actions configuration

Create the `production` GitHub Environment with required reviewers before enabling the workflow. Add these repository variables: `GCP_PROJECT_ID`, `GAR_LOCATION`, `GAR_REPOSITORY`, `GCE_INSTANCE`, `GCE_ZONE`, and `PUBLIC_API_BASE_URL`. Keep `ENABLE_GCE_DEPLOY` unset or `false` until the personal GitHub and GCP accounts are ready.

Store `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` as GitHub Actions secrets. The service account should have only the permissions needed to publish to Artifact Registry and connect to the specific GCE instance; use Workload Identity Federation rather than a service-account key file.

## Release behavior

The workflow builds immutable API and web images, pushes them to Artifact Registry, runs the Prisma migration once with the new API image, and then starts the Compose services. API containers run with `RUN_MIGRATIONS=false`, so scaling or restarting them cannot race database migrations.

Use a commit SHA for `image_tag` unless a rollback needs a previously known image tag. The previous tag can be re-selected manually from the GitHub Actions workflow after verifying its schema compatibility.
