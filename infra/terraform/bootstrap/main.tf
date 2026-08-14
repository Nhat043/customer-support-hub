provider "google" {
  project = var.project_id
}

# These APIs are enabled once by the bootstrap stack before dependent resources.
resource "google_project_service" "required" {
  for_each = toset([
    "iam.googleapis.com",
    "storage.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "terraform_state" {
  name                        = var.state_bucket_name
  project                     = var.project_id
  location                    = var.location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  labels = {
    application = "customer-support-hub"
    managed_by  = "terraform"
    purpose     = "terraform-state"
  }

  depends_on = [google_project_service.required]
}
