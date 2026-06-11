#!/usr/bin/env python3
"""Cross-platform launcher for TK Video Studio (macOS / Linux / Windows).

Usage:
  python start.py          # dev mode: backend + Vite frontend
  python start.py --check  # verify Python, Node, FFmpeg, directories
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
VENV_DIR = ROOT / ".venv"

IS_WINDOWS = sys.platform == "win32"


def load_studio_settings():
    sys.path.insert(0, str(BACKEND_DIR))
    from settings_loader import get_settings

    return get_settings()


def venv_python() -> Path:
    if IS_WINDOWS:
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def find_python() -> str:
    for cmd in ("python3", "python"):
        if shutil.which(cmd):
            return cmd
    raise RuntimeError("Python not found. Install Python 3.9+ and ensure it is on PATH.")


def run(cmd: list[str], *, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    print(f"+ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=cwd or ROOT, check=check)


def ensure_venv() -> Path:
    py = venv_python()
    if not py.is_file():
        bootstrap = find_python()
        run([bootstrap, "-m", "venv", str(VENV_DIR)])
    if not py.is_file():
        raise RuntimeError(f"Failed to create virtualenv at {VENV_DIR}")
    run([str(py), "-m", "pip", "install", "-q", "-r", str(BACKEND_DIR / "requirements.txt")])
    return py


def ensure_frontend_deps() -> None:
    if not (FRONTEND_DIR / "node_modules").is_dir():
        npm = shutil.which("npm")
        if not npm:
            raise RuntimeError("npm not found. Install Node.js 18+.")
        run([npm, "install"], cwd=FRONTEND_DIR)


def wait_http(url: str, timeout_sec: int = 30) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(1)
    return False


def check_environment() -> int:
    print(f"Project root: {ROOT}")
    print(f"Platform:     {sys.platform}")
    print(f"Python:       {sys.version.split()[0]}")

    node = shutil.which("node")
    npm = shutil.which("npm")
    ffmpeg = shutil.which(os.environ.get("TK_FFMPEG", "ffmpeg"))
    ffprobe = shutil.which(os.environ.get("TK_FFPROBE", "ffprobe"))

    print(f"Node.js:      {node or 'NOT FOUND'}")
    print(f"npm:          {npm or 'NOT FOUND'}")
    print(f"ffmpeg:       {ffmpeg or 'NOT FOUND'}")
    print(f"ffprobe:      {ffprobe or 'NOT FOUND'}")

    settings = load_studio_settings()
    print(f"Config file:  {settings.config_path or '(none — using defaults, see studio.config.example.json)'}")
    print(f"Data dir:     {settings.data_dir}")

    ok = bool(node and npm and ffmpeg and ffprobe)
    if ok:
        print("\nEnvironment OK.")
        return 0
    print("\nMissing dependencies — see DEPLOY.md for install instructions.")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Start TK Video Studio")
    parser.add_argument("--check", action="store_true", help="Verify dependencies only")
    args = parser.parse_args()

    if args.check:
        return check_environment()

    py = ensure_venv()
    ensure_frontend_deps()

    settings = load_studio_settings()
    backend_host = settings.backend_host
    backend_port = settings.backend_port
    frontend_host = settings.frontend_host
    frontend_port = settings.frontend_port

    backend_cmd = [
        str(py),
        "-m",
        "uvicorn",
        "main:app",
        "--reload",
        "--host",
        backend_host,
        "--port",
        str(backend_port),
    ]
    frontend_cmd = [
        shutil.which("npm") or "npm",
        "run",
        "dev",
        "--",
        "--host",
        frontend_host,
        "--port",
        str(frontend_port),
    ]

    procs: list[subprocess.Popen] = []

    def shutdown(*_args):
        for proc in procs:
            if proc.poll() is None:
                proc.terminate()
        for proc in procs:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    if IS_WINDOWS:
        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)
    else:
        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)

    print(f"Starting backend  http://{backend_host}:{backend_port}")
    procs.append(
        subprocess.Popen(backend_cmd, cwd=BACKEND_DIR, env=os.environ.copy())
    )

    health_url = f"http://{backend_host}:{backend_port}/api/health"
    print("Waiting for backend...")
    if wait_http(health_url):
        print("Backend ready.")
    else:
        print("Warning: backend not ready within 30s, starting frontend anyway.", file=sys.stderr)

    print(f"Starting frontend http://{frontend_host}:{frontend_port}")
    procs.append(
        subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, env=os.environ.copy())
    )

    print()
    print("TK Video Studio 已启动")
    print(f"  前端: http://{frontend_host}:{frontend_port}")
    print(f"  API:  http://{backend_host}:{backend_port}/docs")
    print(f"  数据: {settings.data_dir}")
    print()
    print("按 Ctrl+C 停止")

    try:
        while True:
            for proc in procs:
                code = proc.poll()
                if code is not None:
                    print(f"Process exited with code {code}", file=sys.stderr)
                    shutdown()
                    return code
            time.sleep(0.5)
    except KeyboardInterrupt:
        shutdown()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
