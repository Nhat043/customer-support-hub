type Environment = Record<string, string | undefined>;

const DURATION_PATTERN = /^\d+(m|h|d)$/;

export function validateEnvironment(environment: Environment): Environment {
  const errors: string[] = [];
  const refreshTokenPepper =
    environment.REFRESH_TOKEN_PEPPER ?? environment.JWT_REFRESH_SECRET;
  const passwordResetPepper =
    environment.PASSWORD_RESET_TOKEN_PEPPER ?? refreshTokenPepper;

  if (environment.EMAIL_PROVIDER && environment.EMAIL_PROVIDER !== "gmail") {
    errors.push("EMAIL_PROVIDER must be gmail when email delivery is enabled");
  }
  if (environment.EMAIL_PROVIDER === "gmail") {
    for (const variable of [
      "EMAIL_FROM",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_SECURE",
      "SMTP_USER",
      "SMTP_PASSWORD",
    ]) {
      if (!environment[variable]) {
        errors.push(`${variable} is required when EMAIL_PROVIDER is gmail`);
      }
    }
    if (environment.SMTP_HOST && environment.SMTP_HOST !== "smtp.gmail.com") {
      errors.push("SMTP_HOST must be smtp.gmail.com for Gmail delivery");
    }
    if (environment.SMTP_PORT && environment.SMTP_PORT !== "465") {
      errors.push("SMTP_PORT must be 465 for Gmail delivery");
    }
    if (environment.SMTP_SECURE && environment.SMTP_SECURE !== "true") {
      errors.push("SMTP_SECURE must be true for Gmail delivery");
    }
  }

  if (environment.AI_PROVIDER === "gemini") {
    if (!environment.GEMINI_API_KEY) errors.push("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
    if (environment.GEMINI_USE_VERTEX_AI !== "false" && !environment.GOOGLE_CLOUD_PROJECT) {
      errors.push("GOOGLE_CLOUD_PROJECT is required for Gemini Vertex AI");
    }
  }

  for (const variable of [
    "ACCESS_TOKEN_TTL",
    "REFRESH_TOKEN_TTL",
    "REFRESH_TOKEN_ABSOLUTE_TTL",
  ]) {
    const value = environment[variable];
    if (value && !DURATION_PATTERN.test(value)) {
      errors.push(`${variable} must use a whole-number m, h, or d duration`);
    }
  }

  if (environment.NODE_ENV === "production") {
    if (environment.COOKIE_SECURE !== "true") {
      errors.push("COOKIE_SECURE must be true in production");
    }
    if (!environment.WEB_BASE_URL?.startsWith("https://")) {
      errors.push("WEB_BASE_URL must use HTTPS in production");
    }
    if (environment.COOKIE_DOMAIN === "localhost") {
      errors.push("COOKIE_DOMAIN cannot be localhost in production");
    }
    validateSecret("JWT_ACCESS_SECRET", environment.JWT_ACCESS_SECRET, errors);
    validateSecret(
      "REFRESH_TOKEN_PEPPER or JWT_REFRESH_SECRET",
      refreshTokenPepper,
      errors,
    );
    validateSecret(
      "PASSWORD_RESET_TOKEN_PEPPER, REFRESH_TOKEN_PEPPER, or JWT_REFRESH_SECRET",
      passwordResetPepper,
      errors,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join("; ")}`);
  }

  return environment;
}

function validateSecret(
  name: string,
  value: string | undefined,
  errors: string[],
) {
  if (!value || value.length < 32 || value.includes("replace-me")) {
    errors.push(`${name} must be at least 32 characters and not a placeholder`);
  }
}
