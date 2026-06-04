STATUS_RANK = {
    "normal": 0,
    "unknown": 1,
    "warning": 2,
    "critical": 3,
}


def worst_status(values: list[str | None]) -> str:
    clean = [value for value in values if value]
    if not clean:
        return "unknown"
    return max(clean, key=lambda value: STATUS_RANK.get(value, STATUS_RANK["unknown"]))


def section_status(*values: str | None) -> str:
    return worst_status(list(values))

