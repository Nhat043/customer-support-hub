terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  # Bucket and prefix are provided at `terraform init` time so this remains
  # reusable across personal GCP projects without committing environment data.
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
