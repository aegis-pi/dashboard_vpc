from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # RDS (SQLAlchemy async). Tests use sqlite+aiosqlite://:memory:
    database_url: str = "sqlite+aiosqlite://:memory:"

    # ElastiCache Redis
    redis_url: str = "redis://localhost:6379"
    redis_auth_token_secret_arn: str = ""

    # DynamoDB — source of truth: AEGIS-DynamoDB-FactoryStatus (ADR 0022)
    ddb_table_status: str = "AEGIS-DynamoDB-FactoryStatus"
    ddb_table_report: str = "aegis-daily-report"

    # S3
    s3_bucket_data: str = "aegis-bucket-data"

    # Cognito
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""

    # AWS
    aws_region: str = "ap-south-1"
    bedrock_region: str = "us-east-1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
