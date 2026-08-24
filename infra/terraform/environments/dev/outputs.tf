output "attachment_bucket_name" {
  description = "Configure the API as GCS_ATTACHMENT_BUCKET with this value."
  value       = module.attachments.bucket_name
}

output "api_service_account_email" {
  description = "Runtime identity to attach to the API workload when deployed."
  value       = google_service_account.api.email
}

output "artifact_registry_repository" {
  description = "Docker repository for gateway, API, and web Cloud Run images."
  value       = google_artifact_registry_repository.application.name
}

output "cloud_run_deterministic_url" {
  description = "Predictable HTTPS URL used for links and same-origin refresh cookies."
  value       = "https://${var.cloud_run_service_name}-${data.google_project.current.number}.${var.region}.run.app"
}

output "cloud_run_url" {
  description = "Deployed Cloud Run service URL, null until deploy_cloud_run is true."
  value       = var.deploy_cloud_run ? google_cloud_run_v2_service.application[0].uri : null
}
