Virtual Metallurgy Lab - Project Backup
========================================

This archive contains the full source code of the Virtual Metallurgy Lab
project as it existed right after the restoration request:
  "right after created by sintheuser on top, write ', Endorsed by Hesamedin Ayati'"

Contents (214 files, ~385 KB):
  - src/                      Next.js 16 app source (App Router, TypeScript)
      app/page.tsx            16 tabs (Architecture module removed)
      components/lab/header.tsx        "Created by Sintheuser, Endorsed by Hesamedin Ayati"
      components/lab/tabs/phase-field-tab.tsx   Restored phase-field with surrogate integration
          • 4 solvers: graph-gnn, tabular-mlp, ensemble, fd
          • Sidebar params wired: surrogateModel, diffusionSteps, guidanceScale
          • Cahn-Hilliard explicit FD with mass-conservation projection
          • Gibbs free-energy chart, phase-fraction evolution, microstructure stats
          • 4 colour maps (metallic, thermal, ipf, binary)
  - public/                   Static assets (logo, robots)
  - prisma/                   Prisma schema
  - db/                       Database client
  - mini-services/            WebSocket / auxiliary services
  - examples/                 Reference WebSocket demo
  - research/                 Research notes
  - package.json, etc.        Config files
  - service-daemon.py         Backend service keep-alive daemon
  - ht-spec.md, MODULES_REPORT.md   Specs and module report
  - worklog.md                Full development worklog (848 lines)

Backend services (not in archive, run separately):
  - pycalphad service on port 8000
  - heat-treatment service on port 8001
  Start with: nohup setsid /home/z/.venv/bin/python /home/z/my-project/service-daemon.py \
              > /home/z/my-project/daemon.log 2>&1 < /dev/null & disown

To run the project:
  cd <extracted-folder>
  bun install
  bun run db:push
  bun run dev
  # open http://localhost:3000
