# ===========================================================================
# Cognito — Admin-only User Pool (ADR 0008)
# Self sign-up disabled, MFA required (TOTP), PKCE authorization code flow
# ===========================================================================

resource "aws_cognito_user_pool" "this" {
  name = "${local.naming_prefix}-UserPool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # MFA required for all users (TOTP)
  mfa_configuration = "ON"

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # Admin-only: users can only be created by an administrator
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-UserPool"
  })
}

# ---------------------------------------------------------------------------
# App Client — PKCE authorization code flow (public client, no secret)
# ---------------------------------------------------------------------------

resource "aws_cognito_user_pool_client" "this" {
  name         = "${local.naming_prefix}-AppClient"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  callback_urls = ["https://${local.dashboard_web_fqdn}/callback"]
  logout_urls   = ["https://${local.dashboard_web_fqdn}/"]

  supported_identity_providers = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  # Tokens: ID 1h, access 1h, refresh 30d
  id_token_validity      = 1
  access_token_validity  = 1
  refresh_token_validity = 30

  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }
}

# ---------------------------------------------------------------------------
# Hosted UI Domain — Cognito-managed login page
# Full URL: https://<prefix>.auth.<region>.amazoncognito.com
# ---------------------------------------------------------------------------

resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}
