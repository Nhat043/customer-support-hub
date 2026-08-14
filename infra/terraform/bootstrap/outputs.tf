output "state_bucket_name" {
  description = "Use this bucket name when initializing environment Terraform backends."
  value       = google_storage_bucket.terraform_state.name
}
