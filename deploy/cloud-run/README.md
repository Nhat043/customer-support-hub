# Cloud Run Demo Deployment

This deployment runs three containers inside one public Cloud Run service:

```text
Browser
  -> Cloud Run HTTPS URL
  -> Nginx gateway (port 8080)
       -> Next.js web (localhost:3000)
       -> NestJS API + Socket.IO (localhost:4000)
            -> Supabase PostgreSQL
            -> Qdrant Cloud
            -> Gemini API
            -> private GCS attachment bucket
```

The gateway makes the browser use one origin:

- `/` reaches Next.js.
- `/api/*` reaches NestJS.
- `/socket.io/*` reaches Socket.IO for the copilot and workspace refresh events.

This is intentional. The refresh token remains a same-origin, secure,
HTTP-only cookie on the `run.app` URL. A separate frontend host would require
cross-site cookie handling and is not suitable for this no-custom-domain demo.

## Cost boundary

The Terraform service defaults to `min_instance_count = 0` and
`max_instance_count = 1`. It can scale to zero while idle and uses the
in-memory rate-limit fallback while there is one instance. Do not increase
`max_instance_count` without configuring a managed Redis endpoint.

Supabase, Qdrant Cloud, Gemini, GCS, Artifact Registry, and network egress can
still incur charges. Create a GCP budget and billing alert before applying
Terraform.

## Prerequisites

- Supabase migrations already applied.
- Qdrant Cloud API key configured locally and verified.
- Existing private GCS attachment bucket managed by Terraform.
- `gcloud auth login` and ADC point to the personal project.
- Terraform remote state backend is initialized for `infra/terraform/environments/dev`.

## Phase 1: provision deployment prerequisites

Set these non-secret values in the ignored
`infra/terraform/environments/dev/terraform.tfvars` file:

```hcl
project_id             = "artful-memento-473909-k0"
region                 = "asia-southeast1"
environment            = "dev"
attachment_bucket_name = "customer-support-hub-artful-memento-473909-k0-attachments"

email_provider = "gmail"
email_from     = "Customer Support Hub <your-gmail@gmail.com>"
smtp_user      = "your-gmail@gmail.com"
qdrant_url     = "https://YOUR-QDRANT-CLUSTER.cloud.qdrant.io"

# Keep false until images and all Secret Manager versions exist.
deploy_cloud_run = false
```

Then provision Artifact Registry, Secret Manager secret containers, Cloud Run
API access, and IAM. This does not start an application:

```bash
cd infra/terraform/environments/dev
terraform fmt -check
terraform validate
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

## Phase 2: create secret versions

Terraform creates secret *containers* only. It never receives or stores secret
values in `tfstate`. Add one current value to each secret in Google Cloud
Console > Secret Manager, or use the command below and paste one value, then
press `Ctrl-D`:

```bash
gcloud secrets versions add customer-support-hub-database-url --data-file=-
```

Create a version for each name:

```text
customer-support-hub-database-url
customer-support-hub-direct-url
customer-support-hub-gemini-api-key
customer-support-hub-qdrant-api-key
customer-support-hub-jwt-access-secret
customer-support-hub-refresh-token-pepper
customer-support-hub-password-reset-token-pepper
customer-support-hub-csrf-secret
customer-support-hub-smtp-password
```

Use the corresponding values from local `.env`. Do not upload `.env` itself or
commit a `terraform.tfvars` file containing secrets.

## Phase 3: build and push three images

Run from repository root. Change `v1` for every release.

```bash
export PROJECT_ID=artful-memento-473909-k0
export REGION=asia-southeast1
export REPOSITORY=customer-support-hub
export TAG=v1
export REGISTRY=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}

gcloud auth configure-docker ${REGION}-docker.pkg.dev

docker build -f deploy/cloud-run/gateway/Dockerfile -t ${REGISTRY}/gateway:${TAG} deploy/cloud-run/gateway
docker build -f apps/api/Dockerfile -t ${REGISTRY}/api:${TAG} .
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=/api -f apps/web/Dockerfile -t ${REGISTRY}/web:${TAG} .

docker push ${REGISTRY}/gateway:${TAG}
docker push ${REGISTRY}/api:${TAG}
docker push ${REGISTRY}/web:${TAG}
```

## Phase 4: create Cloud Run service

Update the ignored `terraform.tfvars`:

```hcl
cloud_run_image_tag = "v1"
deploy_cloud_run    = true
```

Review and apply:

```bash
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Terraform outputs a stable deterministic `run.app` URL. Open it, register a
new demo workspace owner, upload a knowledge guide, and test an attachment.

## Rollback and cleanup

- Roll back code: push a previous image tag and set `cloud_run_image_tag` to it.
- Stop all compute costs: set `deploy_cloud_run = false`, run a reviewed
  `terraform apply`; this removes only the Cloud Run service, not Supabase,
  Qdrant, GCS attachments, or secrets.
- Full GCP cleanup: review `terraform destroy` carefully. The attachment bucket
  uses `force_destroy = false`, so Terraform will not silently delete uploaded
  evidence.
