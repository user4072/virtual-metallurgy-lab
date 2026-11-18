# Showcase draft — Virtual Metallurgy Lab (post after the repo is public)

> Suggested venue: pycalphad Discussions (https://github.com/pycalphad/pycalphad/discussions)
> Title: "Showcase: Virtual Metallurgy Lab — a browser app built on pycalphad (equilibrium, binary mapping, Scheil, Ae1/Ae3)"

---

Hi all — I'd like to share a project built heavily on pycalphad:
**Virtual Metallurgy Lab**, a Next.js + FastAPI teaching/demo application for
alloy design and heat-treatment education.

What it uses pycalphad for (all server-side, port 8000):

- **Equilibrium** for nine alloy systems (Al-Cu, Al-Si, Fe-C, Fe-Cr-Ni,
  CoCrFeMnNi, Ni-Cr-Co, Al-Ni-Ti, Al-Ni-Co and a six-solute steel box) with
  phase fractions + compositions returned as JSON.
- **Binary T–x phase diagrams** computed with the 0.12 `mapping.BinaryStrategy`
  — tieline/invariant data converted to liquidus/solidus/solvus boundaries on
  the fly, cached per system.
- **Scheil-Gulliver solidification** via an equilibrium-stepping driver
  (details below).
- **Ae1/Ae3 anchors** for steels by equilibrium bisection on the MatCalc open
  steel database — these feed the TTT/CCT module so transformation start
  temperatures are real CALPHAD output, not hand-waved formulas.

The databases are the TU Wien **MatCalc open** databases (mc_fe v2.062,
mc_ni v2.034, ODbL 1.0) plus provenance-chained subsystem extracts, and
COST 507 for the Al systems; every file ships with a SHA-256 + citation
registry, and the UI always states whether a result came from CALPHAD or
from an analytical surrogate.

One thing worth flagging: the standalone `scheil` package (0.3.0) raises
`ValueError: Number of degrees of freedom is not zero` during
`starting_point` with pycalphad 0.12, so we ship a compact
equilibrium-stepping Scheil driver instead (~60 lines, same algorithm as the
classic Scheil loop). We documented it in
`docs/contribution/` — happy to turn it into an example or help debug the
package.

Feedback very welcome — especially on the mapping→JSON extraction (there may
be a cleaner API we missed) and on what you'd want in a `pycalphad` examples
folder for web-backend use.
