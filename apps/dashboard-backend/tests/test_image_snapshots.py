from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import boto3
from moto import mock_aws

import deps.rbac as rbac_module
from main import app
from services import s3


def _override_principal(**overrides):
    base = dict(
        user_id="u-1",
        cognito_sub="u-1",
        email="op@example.com",
        display_name="Operator",
        global_role="factory_operator",
        can_view_system=True,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )
    base.update(overrides)
    app.dependency_overrides[rbac_module.get_current_principal] = (
        lambda: rbac_module.Principal(**base)
    )


def test_list_image_snapshots_reads_partition_and_presigns_urls():
    s3._s3_client.cache_clear()
    with mock_aws():
        client = boto3.client("s3", region_name="ap-south-1")
        client.create_bucket(
            Bucket="aegis-bucket-data",
            CreateBucketConfiguration={"LocationConstraint": "ap-south-1"},
        )
        client.put_object(
            Bucket="aegis-bucket-data",
            Key=(
                "image_snapshot/factory_id=factory-a/yyyy=2026/mm=06/dd=09/hh=14/"
                "factory-a_fire_score_20260609T140501.jpg"
            ),
            Body=b"jpeg",
            ContentType="image/jpeg",
        )
        client.put_object(
            Bucket="aegis-bucket-data",
            Key=(
                "image_snapshot/factory_id=factory-a/yyyy=2026/mm=06/dd=09/hh=15/"
                "factory-a_fall_score_20260609T150501.png"
            ),
            Body=b"png",
            ContentType="image/png",
        )

        result = s3._list_image_snapshot_objects_sync(
            "aegis-bucket-data",
            "factory-a",
            datetime(2026, 6, 9, 14, 0),
            datetime(2026, 6, 9, 15, 30),
            120,
            900,
        )

    assert len(result) == 2
    detection_types = {item["detection_type"] for item in result}
    assert detection_types == {"화재", "넘어짐"}
    assert all(item["factory_id"] == "factory-a" for item in result)
    assert all(item["s3_key"].startswith("image_snapshot/factory_id=factory-a/") for item in result)
    assert all("X-Amz-Signature" in item["url"] for item in result)
    assert {item["captured_at"] for item in result} == {
        "2026-06-09T14:05:01",
        "2026-06-09T15:05:01",
    }


def test_list_image_snapshots_filters_within_hour_by_filename_timestamp():
    s3._s3_client.cache_clear()
    with mock_aws():
        client = boto3.client("s3", region_name="ap-south-1")
        client.create_bucket(
            Bucket="aegis-bucket-data",
            CreateBucketConfiguration={"LocationConstraint": "ap-south-1"},
        )
        for filename in (
            "260612141200_event_FIRE.jpg",
            "260612141501_event_FIRE.jpg",
            "260612141959_event_FIRE.jpg",
            "260612142100_event_FIRE.jpg",
        ):
            client.put_object(
                Bucket="aegis-bucket-data",
                Key=f"image_snapshot/factory_id=factory-a/yyyy=2026/mm=06/dd=12/hh=14/{filename}",
                Body=b"jpeg",
                ContentType="image/jpeg",
            )

        result = s3._list_image_snapshot_objects_sync(
            "aegis-bucket-data",
            "factory-a",
            datetime(2026, 6, 12, 14, 15),
            datetime(2026, 6, 12, 14, 20),
            120,
            900,
        )

    assert [item["filename"] for item in result] == [
        "260612141959_event_FIRE.jpg",
        "260612141501_event_FIRE.jpg",
    ]


def test_list_image_snapshots_accepts_kst_aware_chat_range():
    kst = ZoneInfo("Asia/Seoul")
    s3._s3_client.cache_clear()
    with mock_aws():
        client = boto3.client("s3", region_name="ap-south-1")
        client.create_bucket(
            Bucket="aegis-bucket-data",
            CreateBucketConfiguration={"LocationConstraint": "ap-south-1"},
        )
        for filename in (
            "260609092400_event_FIRE.jpg",
            "260609093551_event_FIRE.jpg",
            "260609094600_event_FIRE.jpg",
        ):
            client.put_object(
                Bucket="aegis-bucket-data",
                Key=f"image_snapshot/factory_id=factory-a/yyyy=2026/mm=06/dd=09/hh=09/{filename}",
                Body=b"jpeg",
                ContentType="image/jpeg",
            )

        result = s3._list_image_snapshot_objects_sync(
            "aegis-bucket-data",
            "factory-a",
            datetime(2026, 6, 9, 9, 25, tzinfo=kst),
            datetime(2026, 6, 9, 9, 45, tzinfo=kst),
            120,
            900,
        )

    assert [item["filename"] for item in result] == ["260609093551_event_FIRE.jpg"]


def test_get_image_snapshot_range_uses_existing_s3_partitions():
    s3._s3_client.cache_clear()
    with mock_aws():
        client = boto3.client("s3", region_name="ap-south-1")
        client.create_bucket(
            Bucket="aegis-bucket-data",
            CreateBucketConfiguration={"LocationConstraint": "ap-south-1"},
        )
        for hour in (9, 14):
            client.put_object(
                Bucket="aegis-bucket-data",
                Key=(
                    f"image_snapshot/factory_id=factory-a/yyyy=2026/mm=06/dd=09/hh={hour:02d}/"
                    f"factory-a_fire_score_{hour}.jpg"
                ),
                Body=b"jpeg",
                ContentType="image/jpeg",
            )
        client.put_object(
            Bucket="aegis-bucket-data",
            Key="image_snapshot/factory_id=factory-b/yyyy=2026/mm=06/dd=08/hh=01/other.jpg",
            Body=b"jpeg",
            ContentType="image/jpeg",
        )

        result = s3._get_image_snapshot_range_sync("aegis-bucket-data", "factory-a")

    assert result == {
        "factory_id": "factory-a",
        "available_start": "2026-06-09T09:00",
        "available_latest_hour": "2026-06-09T14:00",
        "object_count": 2,
    }


def test_image_snapshot_range_api_requires_system_access(client, monkeypatch):
    async def _range(*args, **kwargs):  # pragma: no cover
        raise AssertionError("S3 should not be hit when access is denied")

    monkeypatch.setattr(s3, "get_image_snapshot_range", _range)
    _override_principal(can_view_system=False)

    r = client.get("/image-snapshots/range?factory_id=factory-a")

    assert r.status_code == 403


def test_image_snapshots_api_requires_system_access(client, monkeypatch):
    async def _list_snapshots(*args, **kwargs):  # pragma: no cover
        raise AssertionError("S3 should not be hit when access is denied")

    monkeypatch.setattr(s3, "list_image_snapshots", _list_snapshots)
    _override_principal(can_view_system=False)

    r = client.get("/image-snapshots?factory_id=factory-a&start=2026-06-09T14:00&end=2026-06-09T15:00")

    assert r.status_code == 403


def test_image_snapshots_api_returns_items(client, monkeypatch):
    async def _list_snapshots(factory_id, start_time, end_time, max_objects=120):
        assert factory_id == "factory-a"
        assert start_time == datetime(2026, 6, 9, 14, 0)
        assert end_time == datetime(2026, 6, 9, 15, 0)
        assert max_objects == 50
        return [
            {
                "factory_id": factory_id,
                "s3_key": "image_snapshot/factory_id=factory-a/yyyy=2026/mm=06/dd=09/hh=14/fall.png",
                "filename": "fall.png",
                "url": "https://example.test/fall.png",
                "last_modified": datetime(2026, 6, 9, 5, 2, tzinfo=timezone.utc).isoformat(),
                "size_bytes": 1234,
                "detection_type": "넘어짐",
            }
        ]

    monkeypatch.setattr(s3, "list_image_snapshots", _list_snapshots)
    _override_principal(can_view_system=True)

    r = client.get("/image-snapshots?factory_id=factory-a&start=2026-06-09T14:00&end=2026-06-09T15:00&limit=50")

    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["items"][0]["detection_type"] == "넘어짐"


def test_image_snapshots_api_rejects_invalid_range(client):
    r = client.get("/image-snapshots?factory_id=factory-a&start=2026-02-31T14:00&end=2026-06-09T15:00")

    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid time range"


def test_image_snapshots_api_rejects_reversed_range(client):
    r = client.get("/image-snapshots?factory_id=factory-a&start=2026-06-09T15:00&end=2026-06-09T14:00")

    assert r.status_code == 400
    assert r.json()["detail"] == "start must be before end"
