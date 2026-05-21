from processor.risk import calculate


def _sensor(temp=20.0, humid=40.0, fire=0.0, fall=0.0, bend=0.0, sound="none"):
    return {
        "temperature_celsius": temp,
        "humidity_percent": humid,
        "fire_score": fire,
        "fall_score": fall,
        "bend_score": bend,
        "abnormal_sound": sound,
    }


def test_normal_conditions():
    result = calculate(_sensor())
    assert result["level"] == "safe"
    assert result["score"] == 100.0


def test_critical_temperature():
    # Temperature alone deducts 15/35 of the active MVP score budget.
    result = calculate(_sensor(temp=40.0))
    assert result["level"] == "warning"
    assert result["score"] == 57.14


def test_warning_temperature():
    result = calculate(_sensor(temp=35.0))
    assert result["score"] < 100.0
    assert result["score"] > 57.14


def test_high_humidity():
    result = calculate(_sensor(humid=90.0))
    assert result["score"] == 71.43


def test_ai_fire_score():
    result = calculate(_sensor(fire=1.0))
    assert result["score"] == 71.43
    assert any(c["field"] == "ai_event_rate" for c in result["top_causes"])


def test_combined_high_risk():
    result = calculate(_sensor(temp=40.0, humid=90.0, fire=1.0))
    assert result["level"] == "danger"
    assert result["score"] == 0.0


def test_top_causes_sorted():
    result = calculate(_sensor(temp=40.0, fire=0.5))
    causes = result["top_causes"]
    for i in range(len(causes) - 1):
        assert causes[i]["contribution"] >= causes[i + 1]["contribution"]
