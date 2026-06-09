from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # RDS (SQLAlchemy async). Tests use sqlite+aiosqlite:///:memory:
    database_url: str = "sqlite+aiosqlite:///:memory:"
    database_auto_create_metadata: bool = True

    # ElastiCache Redis
    redis_url: str = "redis://localhost:6379"
    redis_auth_token_secret_arn: str = ""
    redis_socket_connect_timeout_seconds: float = 2.0
    redis_socket_timeout_seconds: float = 5.0
    redis_health_check_interval_seconds: int = 30
    redis_pubsub_operation_timeout_seconds: float = 6.0

    # DynamoDB — source of truth: AEGIS-DynamoDB-FactoryStatus (ADR 0022)
    ddb_table_status: str = "AEGIS-DynamoDB-FactoryStatus"
    ddb_table_report: str = "aegis-daily-report"
    dashboard_factory_ids: str = "factory-a,factory-b,factory-c"
    dashboard_factory_discovery_mode: str = "batch_get"
    dashboard_factory_scan_limit: int = 200
    ddb_connect_timeout_seconds: float = 2.0
    ddb_read_timeout_seconds: float = 5.0
    ddb_operation_timeout_seconds: float = 12.0
    ddb_max_attempts: int = 2
    ddb_max_pool_connections: int = 20
    ddb_max_concurrent_operations: int = 10

    # S3
    s3_bucket_data: str = "aegis-bucket-data"
    s3_connect_timeout_seconds: float = 2.0
    s3_read_timeout_seconds: float = 5.0
    s3_operation_timeout_seconds: float = 12.0
    s3_max_attempts: int = 2
    s3_max_pool_connections: int = 10

    # Cognito
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""
    cognito_jwks_timeout_seconds: float = 5.0
    cognito_jwks_ttl_seconds: float = 3600.0
    rbac_bootstrap_super_admin_subs: str = ""

    # AWS
    aws_region: str = "ap-south-1"

    # Bedrock chatbot (ADR 0033 Step 4 / ADR 0016).
    # Model IDs are admin configuration only — never exposed to end users.
    # Tier mapping: fast=default, precise=cause analysis (reasoning quality).
    # Verified invokable in ap-south-1 (2026-06-08); both require inference profiles.
    bedrock_enabled: bool = True
    bedrock_region: str = "ap-south-1"
    bedrock_model_fast: str = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_model_precise: str = "global.anthropic.claude-sonnet-4-6"
    bedrock_max_tokens: int = 512
    bedrock_temperature: float = 0.2
    bedrock_connect_timeout_seconds: float = 3.0
    bedrock_read_timeout_seconds: float = 20.0
    bedrock_operation_timeout_seconds: float = 25.0
    bedrock_max_attempts: int = 2

    # Chat query routing (ADR 0034): an LLM "resolve" step (Converse tool-use)
    # extracts intent/factory/time before the deterministic data tools run.
    # Falls back to the rule parser when disabled, unavailable, or invalid.
    # Only active when bedrock_enabled is also True (resolve needs Bedrock).
    chat_routing_enabled: bool = True
    bedrock_resolve_model: str = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_resolve_max_tokens: int = 512
    bedrock_resolve_operation_timeout_seconds: float = 12.0

    # Browser clients allowed to call the Dashboard API.
    cors_allow_origins: str = "https://dashboard.aegis-pi.cloud,http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
