#!/usr/bin/env python3
"""Import a private JDex registry from stdin; never enable publication implicitly."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raw = sys.stdin.buffer.read()
    source = json.loads(raw)
    if source.get("schema_version") != 1:
        raise ValueError("Unsupported JDex schema")
    entries = source["entries"]
    if not isinstance(entries, list) or not entries:
        raise ValueError("Expected a nonempty entries array")
    seen = set()
    folders = []
    routing = []
    for entry in entries:
        jd_id = entry["jd_id"]
        if not isinstance(jd_id, str) or not re.fullmatch(r"\d{2}\.\d{2}", jd_id) or jd_id in seen:
            raise ValueError("Invalid or duplicate JDex ID")
        seen.add(jd_id)
        if not isinstance(entry.get("label"), str) or not entry["label"].strip():
            raise ValueError("Missing JDex label")
        path = entry.get("onedrive", {}).get("path")
        if not isinstance(path, str) or not path.strip():
            raise ValueError("Missing canonical JDex folder")
        relative = PurePosixPath(path)
        if relative.is_absolute() or ".." in relative.parts or "\\" in path:
            raise ValueError("Unsafe JDex folder")
        folders.append(relative)
        routing.append({"jd_id": jd_id, "label": entry["label"],
                        "state": "review_required", "publication_enabled": False})
    digest = hashlib.sha256(raw).hexdigest()
    print(f"Validated {len(entries)} JDex IDs; source SHA-256 {digest}")
    if args.check:
        return

    root = args.root.resolve()
    registry = root / "registry"
    # A registry folder on this dedicated volume must not redirect writes elsewhere.
    if registry.is_symlink():
        raise ValueError("Registry folder must not be a symlink")
    registry.mkdir(parents=True, exist_ok=True, mode=0o750)
    files = {
        registry / "jdex-registry.source.json": raw,
        registry / "jdex-registry.json": (json.dumps({"schema_version": 1,
            "source_sha256": digest, "entries": routing}, ensure_ascii=False, indent=2) + "\n").encode(),
    }
    # Check every destination before writing anything. Repeated imports are idempotent;
    # an updated registry requires an explicit reconciliation rather than replacement.
    for destination, content in files.items():
        if destination.is_symlink() or (destination.exists() and destination.read_bytes() != content):
            raise ValueError("Existing registry differs; reconcile before importing")
    for relative in folders:
        destination = root / "vault" / relative
        if not destination.resolve().is_relative_to(root / "vault"):
            raise ValueError("Vault folder escapes through a symlink")
    for destination, content in files.items():
        if not destination.exists():
            with destination.open("xb") as handle:
                os.chmod(destination, 0o640)
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
    for relative in folders:
        (root / "vault" / relative).mkdir(parents=True, exist_ok=True, mode=0o750)
    print(f"Imported {len(entries)} JDex folders; publication remains disabled")


if __name__ == "__main__":
    main()
