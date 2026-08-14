variable "project_id" {
  description = "Google Cloud project that owns the Terraform state bucket."
  type        = string
}

variable "state_bucket_name" {
  description = "Globally unique GCS bucket name used only for Terraform state."
  type        = string
}

variable "location" {
  description = "GCS location for the Terraform state bucket."
  type        = string
  default     = "ASIA-SOUTHEAST1"
}
