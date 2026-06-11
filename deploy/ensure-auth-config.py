#!/usr/bin/env python3
"""Ensure studio.config.json has invite codes for production login."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "studio.config.json"
EXAMPLE_PATH = ROOT / "studio.config.server.example.json"


def main() -> int:
    if not CONFIG_PATH.is_file():
        print(f"Missing {CONFIG_PATH}; run deploy/init-server-config.sh first.", file=sys.stderr)
        return 1

    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    auth = cfg.get("auth") or {}
    codes = auth.get("invite_codes") or []
    if codes:
        print(f"Invite auth enabled ({len(codes)} codes).")
        return 0

    if not EXAMPLE_PATH.is_file():
        print(f"Missing {EXAMPLE_PATH}; cannot seed invite codes.", file=sys.stderr)
        return 1

    example = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
    example_codes = (example.get("auth") or {}).get("invite_codes") or []
    if not example_codes:
        print("No invite codes in server example config.", file=sys.stderr)
        return 1

    cfg["auth"] = {"invite_codes": example_codes}
    CONFIG_PATH.write_text(
        json.dumps(cfg, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Added {len(example_codes)} invite codes to {CONFIG_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
