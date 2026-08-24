resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "customer-support-hub-api"
  display_name = "Customer Support Hub API (${var.environment})"
  description  = "Runtime identity for Customer Support Hub API services."
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "cloud_run_dependencies" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "application" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repository_id
  description   = "Customer Support Hub Cloud Run container images"
  format        = "DOCKER"

  labels = {
    application = "customer-support-hub"
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.cloud_run_dependencies]
}

locals {
  cloud_run_secret_names = {
    DATABASE_URL                = "customer-support-hub-database-url"
    DIRECT_URL                  = "customer-support-hub-direct-url"
    GEMINI_API_KEY              = "customer-support-hub-gemini-api-key"
    QDRANT_API_KEY              = "customer-support-hub-qdrant-api-key"
    JWT_ACCESS_SECRET           = "customer-support-hub-jwt-access-secret"
    REFRESH_TOKEN_PEPPER        = "customer-support-hub-refresh-token-pepper"
    PASSWORD_RESET_TOKEN_PEPPER = "customer-support-hub-password-reset-token-pepper"
    CSRF_SECRET                 = "customer-support-hub-csrf-secret"
    SMTP_PASSWORD               = "customer-support-hub-smtp-password"
  }

  cloud_run_environment = {
    NODE_ENV                                 = "production"
    PORT                                     = "4000"
    RUN_MIGRATIONS                           = "false"
    WEB_BASE_URL                             = "https://${var.cloud_run_service_name}-${data.google_project.current.number}.${var.region}.run.app"
    COOKIE_SECURE                            = "true"
    ACCESS_TOKEN_TTL                         = "15m"
    REFRESH_TOKEN_TTL                        = "30d"
    REFRESH_TOKEN_ABSOLUTE_TTL               = "90d"
    AI_PROVIDER                              = "gemini"
    AI_MODEL                                 = "gemini-2.5-flash"
    GEMINI_USE_VERTEX_AI                     = "false"
    VECTOR_STORE                             = "qdrant"
    QDRANT_URL                               = var.qdrant_url
    QDRANT_COLLECTION                        = "customer_support_hub_vectors_v1"
    EMBEDDING_PROVIDER                       = "gemini"
    EMBEDDING_MODEL                          = "gemini-embedding-001"
    EMBEDDING_DIMENSIONS                     = "768"
    STORAGE_PROVIDER                         = "gcs"
    GCS_PROJECT_ID                           = var.project_id
    GCS_ATTACHMENT_BUCKET                    = var.attachment_bucket_name
    EMAIL_PROVIDER                           = var.email_provider
    EMAIL_FROM                               = var.email_from
    SMTP_HOST                                = "smtp.gmail.com"
    SMTP_PORT                                = "465"
    SMTP_SECURE                              = "true"
    SMTP_USER                                = var.smtp_user
    AGENT_RATE_LIMIT_USER_PER_MINUTE         = "10"
    AGENT_RATE_LIMIT_ORGANIZATION_PER_MINUTE = "60"
  }

  cloud_run_image_base = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repository_id}"
}

resource "google_secret_manager_secret" "cloud_run" {
  for_each = toset(values(local.cloud_run_secret_names))

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  labels = {
    application = "customer-support-hub"
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.cloud_run_dependencies]
}

resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each = google_secret_manager_secret.cloud_run

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
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

resource "google_cloud_run_v2_service" "application" {
  count = var.deploy_cloud_run ? 1 : 0

  name                = var.cloud_run_service_name
  project             = var.project_id
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email
    timeout         = "300s"

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      name  = "gateway"
      image = "${local.cloud_run_image_base}/gateway:${var.cloud_run_image_tag}"

      ports {
        container_port = 8080
      }

      startup_probe {
        initial_delay_seconds = 2
        timeout_seconds       = 3
        period_seconds        = 3
        failure_threshold     = 30

        http_get {
          path = "/api/health"
          port = 8080
        }
      }
    }

    containers {
      name  = "api"
      image = "${local.cloud_run_image_base}/api:${var.cloud_run_image_tag}"

      dynamic "env" {
        for_each = local.cloud_run_environment
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.cloud_run_secret_names
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.cloud_run[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }

    containers {
      name  = "web"
      image = "${local.cloud_run_image_base}/web:${var.cloud_run_image_tag}"
    }
  }

  depends_on = [
    google_artifact_registry_repository.application,
    google_secret_manager_secret_iam_member.api_access,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count = var.deploy_cloud_run ? 1 : 0

  project  = var.project_id
  location = google_cloud_run_v2_service.application[0].location
  name     = google_cloud_run_v2_service.application[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
