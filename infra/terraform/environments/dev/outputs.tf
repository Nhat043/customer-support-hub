output "attachment_bucket_name" {
  description = "Configure the API as GCS_ATTACHMENT_BUCKET with this value."
  value       = module.attachments.bucket_name
}

output "api_service_account_email" {
  description = "Runtime identity to attach to the API workload when deployed."
  value       = google_service_account.api.email
}
