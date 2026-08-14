output "bucket_name" {
  description = "Name of the private attachment bucket."
  value       = google_storage_bucket.this.name
}

output "bucket_url" {
  description = "Canonical GCS URL for the private attachment bucket."
  value       = google_storage_bucket.this.url
}
