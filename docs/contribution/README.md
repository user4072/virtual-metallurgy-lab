# Releasing an upstream contribution to pycalphad

This project — and the research pipeline it grew out of — is built on
[pycalphad](https://github.com/pycalphad/pycalphad). This folder collects the
material for giving back upstream.

## 1. Bug report with reproduction (ready to file)

**File:** [`BUG_REPORT.md`](BUG_REPORT.md) · **Repro:** `scripts/repro_export_bug.py`

While exporting an ESPEI-optimized database, ELEMENT lines were written with
`H298`/`S298` = 0.0 (zeroed reference enthalpy/entropy for Co and Hf). Run
`scripts/repro_export_bug.py` to regenerate the minimal case. If you can
reproduce it on the current pycalphad release, open an issue at
<https://github.com/pycalphad/pycalphad/issues> and attach both files.

## 2. Showcase / gallery entry (ready to post)

**File:** [`SHOWCASE.md`](SHOWCASE.md)

A draft discussion post proposing this app as a community showcase for
pycalphad (real equilibrium, binary mapping, Scheil solidification and Ae1/Ae3
anchoring in a browser tool, with honest surrogate-vs-CALPHAD labeling).
Post it at <https://github.com/pycalphad/pycalphad/discussions> or ping the
maintainers in an issue once the repo is public.

## 3. TDB subsystem-extraction guide (documentation contribution)

**File:** [`TDB-EXTRACTION-GUIDE.md`](TDB-EXTRACTION-GUIDE.md)

Documents the provenance-chained workflow developed for this project:
extracting clean subsystem databases (e.g. Fe-Cr-Ni, Co-Cr-Fe-Mn-Ni,
Al-Ni-Ti) from large open databases (TU Wien MatCalc open steel/Ni
databases, ODbL) so pycalphad can parse them fast and reproducibly. A good
candidate for a pycalphad documentation page or example.

## 4. Ideas worth discussing upstream

- **Scheil benchmarking**: our service ships a compact equilibrium-stepping
  Scheil driver (`mini-services/pycalphad-service/server.py`, `_scheil_own`)
  written for pycalphad 0.12 after the standalone `scheil` package (0.3.0)
  hit `ValueError: Number of degrees of freedom is not zero` during the
  starting-point phase. A comparison example / upstream fix would benefit
  everyone.
- **Binary phase-diagram mapping in web backends**: `BinaryStrategy` +
  `get_tieline_data` → JSON boundary/invariant extraction is implemented in
  `binary_scan`; a worked FastAPI example could join the examples folder.
- **Ae1/Ae3 anchoring**: equilibrium bisection on a multicomponent steel
  database (ported from our `tttsteel` project) as a small utility example.
