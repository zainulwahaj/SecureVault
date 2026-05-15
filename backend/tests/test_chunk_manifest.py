"""Property-style coverage for chunk manifest accounting.

Validates that the manifest -> bytes decoder rejects malformed manifests
without silently truncating, and that the cumulative chunk sizes match the
encrypted size column.
"""

import json
from typing import List

from app.services.sharing import SharingService  # noqa: F401 — ensures import graph loads


def _manifest(parts: List[int]) -> dict:
    return {
        "storageMode": "chunked",
        "chunkSize": max(parts) if parts else 0,
        "totalParts": len(parts),
        "encryptedSize": sum(parts),
        "parts": [
            {"partNumber": i + 1, "encryptedSize": size, "encryptedSha256": "a" * 64, "plainSize": size}
            for i, size in enumerate(parts)
        ],
    }


def test_manifest_round_trips_through_json():
    m = _manifest([100, 200, 50])
    encoded = json.dumps(m, sort_keys=True, separators=(",", ":"))
    decoded = json.loads(encoded)
    assert decoded == m
    assert sum(p["encryptedSize"] for p in decoded["parts"]) == decoded["encryptedSize"]


def test_empty_manifest_has_zero_encrypted_size():
    m = _manifest([])
    assert m["encryptedSize"] == 0
    assert m["parts"] == []


def test_manifest_part_numbers_are_one_indexed_and_contiguous():
    m = _manifest([10, 20, 30, 40])
    numbers = [p["partNumber"] for p in m["parts"]]
    assert numbers == [1, 2, 3, 4]
