import "dotenv/config";

const required = [
  "APP_ORIGIN",
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "SESSION_SECRET",
  "S3_BUCKET",
] as const;

const errors: string[] = [];
const warnings: string[] = [];

for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required`);
}

const authMode = process.env.AUTH_MODE || "oidc";
if (!["demo", "oidc", "logged-out"].includes(authMode)) {
  errors.push("AUTH_MODE must be demo, oidc, or logged-out");
}
if (authMode === "oidc") {
  for (const name of [
    "OIDC_ISSUER_URL",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
    "OIDC_REDIRECT_URI",
    "OIDC_POST_LOGOUT_REDIRECT_URI",
  ]) {
    if (!process.env[name]?.trim())
      errors.push(`${name} is required in OIDC mode`);
  }
}

if (
  process.env.DB_SCHEMA &&
  !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(process.env.DB_SCHEMA)
) {
  errors.push("DB_SCHEMA must be a valid PostgreSQL identifier");
}

function validateUrl(name: string) {
  const value = process.env[name];
  if (!value) return;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${name} must use http or https`);
    }
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      if (
        name === "OIDC_ISSUER_URL" &&
        process.env.OIDC_ALLOW_INSECURE_HTTP !== "true"
      ) {
        errors.push(
          "OIDC_ISSUER_URL must use HTTPS unless OIDC_ALLOW_INSECURE_HTTP=true",
        );
      } else {
        warnings.push(`${name} does not use HTTPS`);
      }
    }
  } catch {
    errors.push(`${name} must be an absolute URL`);
  }
}

for (const name of [
  "APP_ORIGIN",
  "OIDC_ISSUER_URL",
  "OIDC_REDIRECT_URI",
  "OIDC_POST_LOGOUT_REDIRECT_URI",
  "S3_ENDPOINT",
]) {
  validateUrl(name);
}

if ((process.env.SESSION_SECRET?.length ?? 0) < 32) {
  errors.push("SESSION_SECRET must contain at least 32 characters");
}

if (process.env.ADMIN_TOKEN && !process.env.ADMIN_SESSION_SECRET) {
  errors.push(
    "ADMIN_SESSION_SECRET is required when ADMIN_TOKEN is configured",
  );
}
if (
  process.env.ADMIN_SESSION_SECRET &&
  process.env.ADMIN_SESSION_SECRET.length < 32
) {
  errors.push("ADMIN_SESSION_SECRET must contain at least 32 characters");
}

if (
  Boolean(process.env.S3_ACCESS_KEY_ID) !==
  Boolean(process.env.S3_SECRET_ACCESS_KEY)
) {
  errors.push(
    "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together",
  );
}

if (process.env.NODE_ENV === "production") {
  if (process.env.OIDC_ALLOW_INSECURE_HTTP === "true") {
    warnings.push(
      "OIDC_ALLOW_INSECURE_HTTP is enabled; use this only for local testing",
    );
  }
  if (
    ["0", "false", "off"].includes(
      String(process.env.DB_SSL ?? "true").toLowerCase(),
    )
  ) {
    warnings.push(
      "DB_SSL is not true; production PostgreSQL traffic is not encrypted",
    );
  }
  if (process.env.S3_CREATE_BUCKET === "true") {
    warnings.push(
      "S3_CREATE_BUCKET is true; production buckets should normally be provisioned by infrastructure",
    );
  }
}

for (const warning of warnings)
  console.warn(`Configuration warning: ${warning}`);

if (errors.length) {
  console.error("Invalid Holedo CRM configuration:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.warn("Holedo CRM configuration validated");
