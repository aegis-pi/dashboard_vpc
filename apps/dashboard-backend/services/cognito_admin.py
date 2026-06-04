from __future__ import annotations

from functools import lru_cache
from typing import TypedDict

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings


class CognitoAdminError(RuntimeError):
    pass


class CognitoUserProfile(TypedDict):
    email: str | None
    display_name: str | None


@lru_cache(maxsize=4)
def _client(region_name: str):
    return boto3.client("cognito-idp", region_name=region_name)


def _cognito():
    return _client(get_settings().aws_region)


def _attr(attributes: list[dict], name: str) -> str | None:
    for attr in attributes:
        if attr.get("Name") == name:
            return attr.get("Value")
    return None


def get_user_profile(username: str) -> CognitoUserProfile:
    settings = get_settings()
    try:
        user = _cognito().admin_get_user(
            UserPoolId=settings.cognito_user_pool_id,
            Username=username,
        )
    except (BotoCoreError, ClientError) as exc:
        raise CognitoAdminError("Cognito user lookup failed") from exc

    attributes = user.get("UserAttributes", [])
    return CognitoUserProfile(
        email=_attr(attributes, "email"),
        display_name=_attr(attributes, "name") or _attr(attributes, "email") or username,
    )


def create_user(email: str, display_name: str) -> str:
    settings = get_settings()
    try:
        _cognito().admin_create_user(
            UserPoolId=settings.cognito_user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": display_name},
            ],
        )
        user = _cognito().admin_get_user(
            UserPoolId=settings.cognito_user_pool_id,
            Username=email,
        )
    except (BotoCoreError, ClientError) as exc:
        raise CognitoAdminError("Cognito user creation failed") from exc

    return _attr(user.get("UserAttributes", []), "sub") or user.get("Username") or email


def disable_user(email: str) -> None:
    settings = get_settings()
    try:
        _cognito().admin_disable_user(
            UserPoolId=settings.cognito_user_pool_id,
            Username=email,
        )
    except (BotoCoreError, ClientError) as exc:
        raise CognitoAdminError("Cognito user disable failed") from exc
