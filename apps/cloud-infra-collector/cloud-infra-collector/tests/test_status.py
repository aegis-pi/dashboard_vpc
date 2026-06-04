from cloud_infra.status import worst_status


def test_worst_status_ranks_expected_order():
    assert worst_status(["normal", "unknown"]) == "unknown"
    assert worst_status(["normal", "warning", "unknown"]) == "warning"
    assert worst_status(["critical", "warning"]) == "critical"
    assert worst_status([]) == "unknown"
