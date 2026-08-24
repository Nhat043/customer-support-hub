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

variable "artifact_repository_id" {
  description = "Artifact Registry Docker repository used by Cloud Run images."
  type        = string
  default     = "customer-support-hub"
}

variable "cloud_run_service_name" {
  description = "Public single-origin Cloud Run service name."
  type        = string
  default     = "customer-support-hub"
}

variable "cloud_run_image_tag" {
  description = "Shared image tag for gateway, API, and web images."
  type        = string
  default     = "v1"
}

variable "deploy_cloud_run" {
  description = "Creates the public Cloud Run service only after images and secret versions are ready."
  type        = bool
  default     = false
}

variable "qdrant_url" {
  description = "Qdrant Cloud endpoint used by the runtime."
  type        = string
  default     = ""
}

variable "email_provider" {
  description = "Optional transactional email provider. Use gmail only when SMTP settings are configured."
  type        = string
  default     = ""
}

variable "email_from" {
  description = "Non-secret sender display address for transactional email."
  type        = string
  default     = ""
}

variable "smtp_user" {
  description = "Non-secret Gmail SMTP account address."
  type        = string
  default     = ""
}
