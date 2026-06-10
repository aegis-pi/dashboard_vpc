"""Runtime configuration contract between local defaults and ECS overrides."""
import ast
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = REPO_ROOT / "apps" / "dashboard-backend" / "config.py"
ECS_TF_PATH = REPO_ROOT / "infra" / "data-dashboard" / "ecs.tf"

RESOURCE_SPECIFIC_ENV = {
    "AWS_REGION",
    "COGNITO_APP_CLIENT_ID",
    "COGNITO_USER_POOL_ID",
    "CORS_ALLOW_ORIGINS",
    "DDB_TABLE_REPORT",
    "DDB_TABLE_STATUS",
    "RBAC_BOOTSTRAP_SUPER_ADMIN_SUBS",
    "S3_BUCKET_DATA",
}


def _settings_defaults() -> dict[str, object]:
    module = ast.parse(CONFIG_PATH.read_text())
    for node in module.body:
        if isinstance(node, ast.ClassDef) and node.name == "Settings":
            defaults: dict[str, object] = {}
            for stmt in node.body:
                if (
                    isinstance(stmt, ast.AnnAssign)
                    and isinstance(stmt.target, ast.Name)
                    and stmt.value is not None
                ):
                    try:
                        defaults[stmt.target.id.upper()] = ast.literal_eval(stmt.value)
                    except (ValueError, SyntaxError):
                        pass
            return defaults
    raise AssertionError("Settings class not found")


def _literal_ecs_env() -> dict[str, str]:
    return dict(re.findall(r'\{ name = "([A-Z0-9_]+)", value = "([^"]*)" \}', ECS_TF_PATH.read_text()))


def _coerce(value: str, default: object) -> object:
    if isinstance(default, bool):
        return value.lower() == "true"
    if isinstance(default, int) and not isinstance(default, bool):
        return int(value)
    if isinstance(default, float):
        return float(value)
    return value


def test_literal_ecs_env_overrides_match_local_settings_defaults():
    defaults = _settings_defaults()
    ecs_env = _literal_ecs_env()

    mismatches = {}
    for name, raw_value in ecs_env.items():
        if name not in defaults or name in RESOURCE_SPECIFIC_ENV:
            continue
        coerced = _coerce(raw_value, defaults[name])
        if coerced != defaults[name]:
            mismatches[name] = {"config.py": defaults[name], "ecs.tf": raw_value}

    assert mismatches == {}
