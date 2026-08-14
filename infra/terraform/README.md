# Customer Support Hub Terraform

This directory contains the Google Cloud infrastructure definition for Customer
Support Hub. Terraform is used as the infrastructure-as-code (IaC) tool so
cloud resources are reviewed through a declarative plan before they are
created or changed.

## Safety boundary

Terraform configuration is committed to Git. Terraform state, real
`*.tfvars` files, credentials, and service-account keys are never committed.

The commands below initialize, format, validate, and preview infrastructure.
They do **not** create any cloud resource until `terraform apply` is run.
Do not run `terraform apply` until the plan has been reviewed and the GCP
budget/ownership has been confirmed.

## Directory layout

```text
infra/terraform/
├── bootstrap/                    # One-time remote Terraform state bucket
│   ├── main.tf                   # Enables required APIs and creates state GCS bucket
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
├── modules/
│   └── gcs-attachments/          # Reusable private attachment bucket module
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    └── dev/                      # Customer Support Hub development environment
        ├── provider.tf
        ├── main.tf               # API service account and attachment bucket
        ├── variables.tf
        ├── outputs.tf
        └── terraform.tfvars.example
```

## Prerequisites

- Terraform `>= 1.6.0`
- Google Cloud CLI authenticated with Application Default Credentials (ADC)
- A GCP project selected for the personal account

The current local machine has already completed ADC login. Terraform's Google
provider uses these credentials; no JSON service-account key is needed for
local development.

```bash
gcloud config get-value project
gcloud auth application-default print-access-token > /dev/null && echo "ADC is ready"
```

## First-time setup: bootstrap remote state

The bootstrap stack starts with local state because the state bucket does not
exist yet.

```bash
cd infra/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars and ensure state_bucket_name is globally unique.
terraform init -backend=false
terraform fmt -check
terraform validate
terraform plan -var-file=terraform.tfvars
```

After the bootstrap plan is reviewed and explicitly applied, it creates a
private versioned GCS bucket for Terraform state and enables the required GCP
APIs. First migrate the bootstrap stack's own local state into that bucket:

```bash
terraform init \
  -backend-config="bucket=YOUR_TERRAFORM_STATE_BUCKET" \
  -backend-config="prefix=customer-support-hub/bootstrap" \
  -migrate-state
```

Then configure the development environment to use the same remote backend with
its own state prefix:

```bash
cd ../environments/dev
terraform init \
  -backend-config="bucket=YOUR_TERRAFORM_STATE_BUCKET" \
  -backend-config="prefix=customer-support-hub/dev" \
  -migrate-state
```

The backend settings are deliberately supplied at init time. Terraform backend
blocks cannot reference normal Terraform variables, and keeping the bucket name
out of committed configuration makes this stack reusable across projects.

## Development attachment bucket

```bash
cd infra/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
# Edit project_id and choose a globally unique attachment_bucket_name.
terraform init
terraform fmt -check
terraform validate
terraform plan -var-file=terraform.tfvars
```

The dev environment creates:

- One private, versioned GCS bucket for uploaded request attachments.
- One API service account, `customer-support-hub-api`.
- Bucket-scoped `roles/storage.objectAdmin` for that service account. This
  grants only object read/write/delete permissions in this attachment bucket,
  not project-wide Storage administration.

The application will later receive only these configuration values:

```dotenv
STORAGE_PROVIDER=gcs
GCS_PROJECT_ID=your-project-id
GCS_ATTACHMENT_BUCKET=your-attachment-bucket
```

It should use Application Default Credentials on GCE/Cloud Run or Workload
Identity Federation in CI. Do not create or commit a downloaded service-account
key for this project.

## Security decisions

- `uniform_bucket_level_access = true`: IAM is the single access-control model;
  object ACLs cannot bypass it.
- `public_access_prevention = "enforced"`: uploaded customer attachments can
  never be accidentally made public.
- `versioning` is enabled: accidental overwrite/delete can be recovered.
- `force_destroy = false`: Terraform cannot silently destroy a non-empty
  evidence/attachment bucket.
- No object lifecycle deletion policy is set yet. Support attachments can be
  business evidence, so retention must be agreed before automation deletes old
  versions.

## CI and production follow-up

GitHub Actions should later authenticate through Workload Identity Federation,
then run `terraform fmt -check`, `terraform validate`, and a reviewed plan. A
human-approved deployment workflow should be the only place allowed to run
`terraform apply`.
