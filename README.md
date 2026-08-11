# Customer Support Hub

A multi-tenant workspace for support and operations teams to capture customer requests, assign work, collaborate on resolution, and use an AI helper with auditable actions.

The project is designed as a portfolio-grade full-stack system rather than a UI-only demo. It focuses on tenant isolation, secure session handling, role-based access, event history, testing, observability, and a deployable container architecture.

## What It Does

- Creates a company workspace when its first owner registers.
- Lets owners and admins invite teammates with `ADMIN`, `MEMBER`, or `VIEWER` permissions.
- Keeps delivery issues, refund requests, and customer questions as trackable customer requests.
- Supports comments, request state changes, and an audit trail within the active company/workspace.
- Provides an AI helper with allow-listed function tools, streaming over Socket.IO, idempotent agent runs, private chat history, and semantic vector memory.
- Uses mock AI by default, while Gemini function calling and `gemini-embedding-001` can be enabled with an API key.

## Roles

| Role | Primary responsibility |
| --- | --- |
| Owner | Creates the company workspace, manages workspace settings, and invites the initial team. |
| Admin | Manages team members and operational setup. |
| Member | Creates, updates, comments on, and resolves customer requests. |
| Viewer | Reads workspace activity without changing requests. |

An account is not permanently tied to one role. A user has a role per company membership and can belong to more than one company.

## Architecture

```text
Next.js web app
        |
        | HTTPS / REST + Socket.IO
        v
NestJS API
  |-- Auth, refresh-token sessions, RBAC, rate limiting
  |-- Organizations, workspaces, invitations, customer requests
  |-- AI agent tools, idempotent runs, streamed events
  |
  +--> PostgreSQL / Prisma: tenant data, sessions, audit records
  +--> Redis: shared rate limiting and runtime coordination
  +--> Qdrant: optional AI memory vector store
  +--> Prometheus + Loki + Grafana: metrics and logs
```

Tenant boundaries are enforced from the organization/workspace context and role guard, rather than trusting a client-provided tenant identifier alone.

### Redis Rate-Limit Resilience

Redis provides the shared rate-limit store when `REDIS_URL` is configured. Its connection retries with exponential backoff, and the API continues with a local in-memory limiter while Redis is unavailable. `GET /api/health` exposes the active mode as `redis`, `memory`, or `memory_fallback`; Prometheus exposes Redis availability and fallback counters.

The fallback intentionally keeps the API available, but its counters are per API instance. During a Redis outage, a multi-replica deployment therefore has weaker global rate limiting until Redis reconnects. This status should be monitored before a production rollout.

## Stack

- **Frontend:** Next.js 15, React 19, TypeScript
- **Backend:** NestJS 11, TypeScript, Socket.IO
- **Database:** PostgreSQL, Prisma migrations
- **AI:** Gemini function calling, allow-listed tools, `gemini-embedding-001`, Qdrant semantic memory
- **Runtime:** Docker Compose, Redis, Qdrant
- **Observability:** Prometheus, Loki, Grafana
- **Quality:** ESLint, TypeScript, Prisma validation, unit tests with an 80% coverage gate
- **CI:** GitHub Actions

## Repository Layout

```text
apps/
  api/                 NestJS API, modules, unit tests
  web/                 Next.js application
packages/shared/       Shared TypeScript contracts
prisma/                Prisma schema and SQL migrations
infra/observability/   Prometheus, Loki, Grafana, Promtail configuration
deploy/gce/            Production Compose reference for a future personal GCE setup
.github/workflows/     CI and manually gated deployment workflow
```

## Run Locally

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+
- Docker Desktop, for Redis, Qdrant, and observability services

### Configure environment

```bash
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to a local PostgreSQL database. The default AI mode is `mock`; no OpenAI or other provider key is required.

### Optional: Gmail invitation emails

Team invitations use secure one-time tokens. With email disabled, an owner/admin can copy the generated invitation link manually. To send those links from `nhatnl04@gmail.com` during local development, enable Google two-step verification, create a Google **App Password**, then set these values in the uncommitted `.env` file:

```dotenv
EMAIL_PROVIDER=gmail
EMAIL_FROM="Customer Support Hub <nhatnl04@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=nhatnl04@gmail.com
SMTP_PASSWORD=your-16-character-google-app-password
```

Never use the normal Gmail password, commit the App Password, or paste it into GitHub Actions. A failed SMTP delivery leaves the invitation pending and exposes a copyable fallback link only to the authenticated owner/admin who created it.

Password recovery sends a six-digit OTP that is valid for ten minutes and accepts at most five verification attempts. The API stores only an HMAC hash of the OTP/reset token; confirmed passwords are stored with bcrypt. Set a distinct `PASSWORD_RESET_TOKEN_PEPPER` in `.env` for non-local environments.

### Install and migrate

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

### Start services

For local development with the app running from source:

```bash
docker compose up -d redis qdrant prometheus loki promtail grafana
pnpm --filter @customer-support-hub/api dev
pnpm --filter @customer-support-hub/web dev
```

Or run the local Compose stack after setting `LOCAL_DATABASE_URL`. When PostgreSQL runs on the same machine as Docker Desktop, use `host.docker.internal` as its hostname rather than a WSL gateway IP. Gmail SMTP variables in `.env` are passed only to the local API container:

```dotenv
LOCAL_DATABASE_URL=postgresql://postgres:replace-me@host.docker.internal:5432/workflow_platform_dev?schema=public
```

```bash
docker compose up -d
```

Local endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/api/docs`
- Grafana: `http://localhost:3001` (`admin` / `admin` for local development)
- Prometheus: `http://localhost:9090`

## Quality Checks

```bash
pnpm lint
pnpm --filter @customer-support-hub/api test:coverage
pnpm --filter @customer-support-hub/api test:eval
pnpm build
pnpm exec prisma validate --schema prisma/schema.prisma
```

The GitHub Actions CI workflow runs these checks on every pull request and every push to `main`. It also builds the API and web Docker images to validate production Dockerfiles.

With the Docker stack running, run the real local service checks separately:

```bash
pnpm test:integration
pnpm test:e2e:smoke
```

The integration suite verifies the live API health endpoint and Qdrant tenant/workspace filter. The E2E smoke test verifies that the running web application serves the Customer Support Hub landing page.

The browser E2E suite covers the owner journey: create a company workspace, create a customer request, and ask the AI assistant about that request. Start the API and standalone web application first, then run:

```bash
pnpm --filter @customer-support-hub/web exec playwright install chromium
pnpm --filter @customer-support-hub/web test:e2e
```

GitHub Actions provisions PostgreSQL, Redis, and Qdrant for integration and browser checks on pull requests and pushes to `main`.

### Agent Security Evaluations

`pnpm --filter @customer-support-hub/api test:eval` is a deterministic suite that checks function-tool routing, allow-listed navigation, tenant and workspace scoping, Viewer mutation denial, and prompt-injection resistance. It uses the local mock provider, so it runs without an AI API key or a running application.

## Gemini Semantic Memory

Set these uncommitted `.env` values to use Gemini for both the agent and semantic memory:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your-gemini-api-key
VECTOR_STORE=qdrant
EMBEDDING_PROVIDER=gemini
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
QDRANT_COLLECTION=agent_memory_semantic_v1
```

Conversation history remains in PostgreSQL per organization, user, and workspace. Qdrant stores semantic retrieval vectors under the same tenant scope. The `agent_memory_semantic_v1` collection is deliberately new so the old 64-dimensional deterministic vectors are not overwritten. The model never receives database credentials or SQL access; it can only access data through the reviewed function tools.

## Workspace Knowledge RAG

Owners and admins can open **Knowledge** in a workspace and upload UTF-8 Markdown (`.md`) documents. The API stores document metadata and chunks in PostgreSQL, embeds each chunk, and indexes it in the configured vector store. It rejects duplicate document content within the same organization/workspace and retains a failed index record so it can be removed and retried safely.

At question time, the copilot retrieves only vectors with the current organization ID, active workspace ID, and `sourceType=knowledge`. Private agent memories use a different user-scoped filter and are never returned as workspace knowledge. Gemini receives the matching excerpts with source names, and the drawer renders source cards from the citations returned by the API. PDF/DOCX parsing is intentionally out of scope for this first Markdown-only ingestion path.

## Deployment Safety

This repository includes a GCE deployment workflow as infrastructure reference only.

- It runs **only** from GitHub Actions `workflow_dispatch`; a push to `main` cannot deploy.
- It is blocked unless the repository variable `ENABLE_GCE_DEPLOY` is explicitly set to `true`.
- No cloud credentials, GCP project IDs, or production secrets are committed to this repository.

No deployment is required to explore or run the project locally.

## Roadmap

- Request assignment, SLA targets, and customer-facing status updates.
- Agent evaluation datasets and production-grade semantic-memory observability.
- Tenant-level analytics and agent evaluation datasets.
