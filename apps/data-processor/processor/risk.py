# MVP safety score weights and thresholds from configs/runtime/runtime-config.yaml.
# Higher score is safer: 100-85 safe, 84-50 warning, 49-0 danger.
# Infra-based factors (node_status, pod_health, etc.) are added in M6.
_TEMP_WEIGHT = 15.0
_HUMID_WEIGHT = 10.0
_AI_WEIGHT = 10.0
_ACTIVE_WEIGHT = _TEMP_WEIGHT + _HUMID_WEIGHT + _AI_WEIGHT

_TEMP_WARNING = 32.0
_TEMP_CRITICAL = 38.0
_HUMID_WARNING = 70.0
_HUMID_CRITICAL = 85.0

_LEVEL_SAFE_MIN = 85.0
_LEVEL_WARNING_MIN = 50.0


def calculate(normalized: dict) -> dict:
    contributions = []

    temp_penalty = _temperature_risk(normalized.get("temperature_celsius", 0.0))
    if temp_penalty > 0:
        contributions.append({
            "field": "temperature",
            "value": normalized.get("temperature_celsius"),
            "contribution": _score_penalty(temp_penalty),
        })

    humid_penalty = _humidity_risk(normalized.get("humidity_percent", 0.0))
    if humid_penalty > 0:
        contributions.append({
            "field": "humidity",
            "value": normalized.get("humidity_percent"),
            "contribution": _score_penalty(humid_penalty),
        })

    ai_penalty = _ai_risk(
        normalized.get("fire_score", 0.0),
        normalized.get("fall_score", 0.0),
        normalized.get("bend_score", 0.0),
        normalized.get("abnormal_sound", "none"),
    )
    if ai_penalty > 0:
        contributions.append({
            "field": "ai_event_rate",
            "value": max(
                normalized.get("fire_score", 0.0),
                normalized.get("fall_score", 0.0),
                normalized.get("bend_score", 0.0),
            ),
            "contribution": _score_penalty(ai_penalty),
        })

    raw_penalty = temp_penalty + humid_penalty + ai_penalty
    score = round(max(0.0, 100.0 - _score_penalty(raw_penalty)), 2)
    contributions.sort(key=lambda x: x["contribution"], reverse=True)

    return {
        "score": score,
        "level": _level(score),
        "top_causes": contributions[:5],
    }


def _temperature_risk(temp: float) -> float:
    if temp >= _TEMP_CRITICAL:
        return _TEMP_WEIGHT
    if temp >= _TEMP_WARNING:
        return _TEMP_WEIGHT * (temp - _TEMP_WARNING) / (_TEMP_CRITICAL - _TEMP_WARNING)
    return 0.0


def _humidity_risk(humid: float) -> float:
    if humid >= _HUMID_CRITICAL:
        return _HUMID_WEIGHT
    if humid >= _HUMID_WARNING:
        return _HUMID_WEIGHT * (humid - _HUMID_WARNING) / (_HUMID_CRITICAL - _HUMID_WARNING)
    return 0.0


def _ai_risk(fire: float, fall: float, bend: float, sound: str) -> float:
    peak = max(fire, fall, bend)
    sound_bonus = 0.5 if sound not in ("none", "") else 0.0
    return min(_AI_WEIGHT, peak * _AI_WEIGHT + sound_bonus)


def _score_penalty(raw_penalty: float) -> float:
    return round((raw_penalty / _ACTIVE_WEIGHT) * 100.0, 2)


def _level(score: float) -> str:
    if score >= _LEVEL_SAFE_MIN:
        return "safe"
    if score >= _LEVEL_WARNING_MIN:
        return "warning"
    return "danger"
