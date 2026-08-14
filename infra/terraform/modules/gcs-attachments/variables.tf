variable "project_id" {
  description = "Google Cloud project that owns the attachment bucket."
  type        = string
}

variable "name" {
  description = "Globally unique GCS bucket name."
  type        = string
}

variable "location" {
  description = "GCS location for attachment objects."
  type        = string
}

variable "labels" {
  description = "Labels applied to the attachment bucket."
  type        = map(string)
  default     = {}
}
