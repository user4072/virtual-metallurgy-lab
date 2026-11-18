#!/usr/bin/env python3
"""
start_service.py — launch one of the project's Python microservices with a
clean interpreter state.

Usage:
  python scripts/start_service.py <pycalphad|heat-treatment|micrograph>

Guarantees:
  - PYTHONPATH is cleared for the child process so a globally-installed
    pycalphad (e.g. the developer's other work) can never leak into the
    project venv.
  - The repo-local .venv python is used unless VML_PYTHON overrides it.
  - The micrograph service may instead run on the interpreter given by
    MICROGRAPH_PYTHON (e.g. a global Python with torch+CUDA installed).
"""
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

SERVICES = {
    "pycalphad": {
        "script": os.path.join("mini-services", "pycalphad-service", "server.py"),
        "port_env": "PYCALPHAD_PORT",
        "default_port": 8000,
        "python_env": "VML_PYTHON",
    },
    "heat-treatment": {
        "script": os.path.join("mini-services", "heat-treatment-service", "main.py"),
        "port_env": "HT_PORT",
        "default_port": 8001,
        "python_env": "VML_PYTHON",
    },
    "micrograph": {
        "script": os.path.join("mini-services", "micrograph-service", "server.py"),
        "port_env": "MICROGRAPH_PORT",
        "default_port": 8003,
        # diffusion needs torch+CUDA — allow a dedicated interpreter
        "python_env": "MICROGRAPH_PYTHON",
        "fallback_env": "VML_PYTHON",
    },
}


def venv_python() -> str:
    cand = os.path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
    if not os.path.exists(cand):
        cand = os.path.join(REPO_ROOT, ".venv", "bin", "python")
    return cand


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in SERVICES:
        print(__doc__)
        return 1
    svc = SERVICES[sys.argv[1]]
    python = os.environ.get(svc["python_env"]) or (
        os.environ.get(svc.get("fallback_env", "")) if svc.get("fallback_env") else None
    ) or venv_python()
    script = os.path.join(REPO_ROOT, svc["script"])
    if not os.path.exists(script):
        print(f"service script not found: {script}")
        return 1
    env = dict(os.environ)
    keep_pythonpath = svc["python_env"] == "MICROGRAPH_PYTHON"
    if not keep_pythonpath:
        env.pop("PYTHONPATH", None)  # venv services: never leak global site-packages
    env.setdefault(svc["port_env"], str(svc["default_port"]))
    print(f"[start_service] {sys.argv[1]} via {python} ({svc['port_env']}={env[svc['port_env']]})")
    if keep_pythonpath:
        return os.spawnl(os.P_WAIT, python, python, "-s", script)
    return os.spawnl(os.P_WAIT, python, python, "-E", "-s", script)


if __name__ == "__main__":
    sys.exit(main())
