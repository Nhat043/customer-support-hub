variable "project_id" {
  description = "Google Cloud project that owns Customer Support Hub development resources."
  type        = string
}

variable "region" {
  description = "Default GCP region for future regional resources."
  type        = string
  default     = "asia-southeast1"
}

variable "attachment_bucket_name" {
  description = "Globally unique GCS bucket name for private request attachments."
  type        = string
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "dev"
}
