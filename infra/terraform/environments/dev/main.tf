resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "customer-support-hub-api"
  display_name = "Customer Support Hub API (${var.environment})"
  description  = "Runtime identity for Customer Support Hub API services."
}

module "attachments" {
  source = "../../modules/gcs-attachments"

  project_id = var.project_id
  name       = var.attachment_bucket_name
  location   = upper(var.region)
  labels = {
    application = "customer-support-hub"
    environment = var.environment
    managed_by  = "terraform"
    purpose     = "attachments"
  }
}

# This is deliberately bucket-scoped: the runtime identity cannot administer
# Storage elsewhere in the project.
resource "google_storage_bucket_iam_member" "api_attachment_objects" {
  bucket = module.attachments.bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}
