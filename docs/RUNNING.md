# Running the Virtual Metallurgy Lab

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | any modern LTS |
| Bun (or npm) | ≥ 1.1 | package manager for the frontend |
| Python | ≥ 3.11 | for the microservices |
| pip + venv | — | comes with Python |

GPU is **not required** — the microstructure generator has a procedural
physics backend; the diffusion backend is optional (see below).

## 1. Frontend

```bash
bun install          # or: npm install
```

## 2. Python environment (repo-local venv, isolated from your system Python)

```bash
python -m venv .venv
# Linux / macOS:
.venv/bin/python -m pip install -r mini-services/pycalphad-service/requirements.txt \
                                -r mini-services/heat-treatment-service/requirements.txt
# Windows (Git Bash / PowerShell):
.venv\Scripts\python -m pip install -r mini-services/pycalphad-service/requirements.txt ^
                                    -r mini-services/heat-treatment-service/requirements.txt
```

The venv is fully self-contained. The start scripts **clear `PYTHONPATH`** for
the services so a globally installed pycalphad (or any other package) can
never leak into the project venv.

## 3. Start everything

```bash
# bash / Git Bash / WSL
bash scripts/start-dev.sh all

# or PowerShell (Windows)
powershell -File scripts\start-dev.ps1 all
```

This starts:

| Service | Port | Log |
|---|---|---|
| pycalphad-service (real CALPHAD) | 8000 | `logs/pycalphad.log` |
| heat-treatment-service | 8001 | `logs/heat-treatment.log` |
| micrograph-service | 8003 | `logs/micrograph.log` |
| Next.js dev server | 3000 | console |

Then open **http://localhost:3000**.

You can also start services individually:

```bash
bash scripts/start-dev.sh pycalphad     # or heat-treatment / micrograph / next
```

Database load takes ~5–60 s (the MatCalc databases are large); check
`http://localhost:8000/health` — every entry should read `LOADED`. While a
service is down the UI degrades gracefully to its labeled analytical
surrogate ("Regular-solution surrogate — NOT CALPHAD").

## 4. Optional: the diffusion image backend

The micrograph service runs its procedural physics backend everywhere.
To enable Stable Diffusion generation, point `MICROGRAPH_PYTHON` at an
interpreter that already has `torch` (+CUDA) and `diffusers` installed — the
service uses it read-only, installs nothing:

```bash
# example (Windows): the interpreter that already has your ML stack
set MICROGRAPH_PYTHON=C:\path\to\python_with_torch.exe
bash scripts/start-dev.sh micrograph   # or restart via start-dev.ps1
```

Check `http://localhost:8003/micrograph/health` → `"diffusion": true`.
Without it the service honestly reports `diffusion: false` and uses the
procedural backend.

## 5. Using your own thermodynamic databases

Databases live in `data/databases/` and are described by
`data/databases/registry.json` (source, license, citation, SHA-256).
Add yours by dropping a `.tdb` file in that folder, adding a registry entry
(keep the SHA-256 honest), and mapping a system in
`mini-services/pycalphad-service/server.py` (`SYSTEMS`).

## 6. Tests

```bash
.venv/Scripts/python -m pytest mini-services/tests -q   # physics unit tests
bun run lint                                            # ESLint
bunx tsc --noEmit                                       # TypeScript
```
