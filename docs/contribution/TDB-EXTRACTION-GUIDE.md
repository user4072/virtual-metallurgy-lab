# Extracting clean subsystem TDBs from large open databases

*A provenance-chained workflow developed for the Virtual Metallurgy Lab and
its sister research projects (fe_surrogate, tttsteel, project3).*

Large thermodynamic databases (the TU Wien MatCalc open steel/Ni databases,
COST 507, ...) cover dozens of elements and hundreds of phases. For
application work you usually need a **subsystem** — e.g. Fe-Cr-Ni or
Co-Cr-Fe-Mn-Ni — and you need it to (a) parse cleanly with pycalphad,
(b) contain every phase that can be stable in that subsystem, and (c) carry
provenance you can defend in a paper.

## The workflow

1. **Pin the source.** Record the upstream file, its SHA-256, version/date,
   license and citation in a registry (`data/databases/registry.json` in this
   repo). Re-verify the hash on every build.

2. **Extract by constitution, not by whitelist.** For every phase in the
   master database, keep it if *any* constituent sublattice can be filled
   entirely from your element subset. This avoids the classic failure of
   hand-picked phase lists: silently dropping a phase (σ, Laves, M23C6...)
   that is stable in your subsystem. The reference implementation is
   `create_ternary_tdb.py` from the fe_surrogate project ("no hand-picked
   whitelist, no stable phase silently dropped").

3. **Keep all unaries and reference functions.** Keep every `FUNCTION` for
   the SGTE reference states of all elements (even ones outside your
   subsystem — they cost nothing and prevent `KeyError`s), and keep
   `TYPE_DEFINITION` blocks used by kept phases.

4. **Strip framework-specific statements.** MatCalc exports contain
   `REFERENCE_ELEMENT`, `ADD_COMPOSITION_SET`, `ATTACH_CONTRIBUTION` and
   `PARAMETER HMVA` (vacancy enthalpies) lines that pycalphad's parser
   rejects or cannot use. Strip them **only after verifying** no kept
   `PARAMETER` references the removed composition sets (`grep '#2'`), and
   record exactly what was stripped in the registry note. See
   `scripts/prepare_tdb.py` for a reproducible, documented cleanup pass.

5. **Fix export artifacts upstream-safe.** Real files contain typos (a
   semicolon instead of a comma in a `PARAMETER G(PHASE;...)` header,
   doubled decimals `6000.00.00`, two PARAMETER statements sharing one
   `REF:` line, stray `>` continuation markers). Fix them in a scripted pass,
   never by hand-editing the file, and re-run the hash.

6. **Prove equivalence.** Before/after, verify on a grid of compositions and
   temperatures that the extract reproduces the master database's equilibrium
   (phase set + fractions) — `validate_tdb_equivalence.py` in fe_surrogate
   does exactly this and is the step that catches accidentally-dropped
   phases.

7. **Re-check encoding.** MatCalc files are frequently ISO-8859-1; convert to
   UTF-8 losslessly as part of the script (never in an editor).

## What you end up with

In this repository:

| File | Subsystem | Master |
|---|---|---|
| `mc_fe_v2.062.tdb` | Fe + 25 elements (full) | MatCalc mc_fe v2.062 |
| `mc_fe_v2.062_clean_fecmnsicrmoni.tdb` | Fe-C-Mn-Si-Cr-Mo-Ni | mc_fe v2.062 |
| `fecrni_ternary.tdb` | Fe-Cr-Ni | mc_fe v2.062 |
| `cocrfemnni_quinary.tdb` | Co-Cr-Fe-Mn-Ni (Cantor) | mc_fe v2.062 |
| `alniti_ternary.tdb`, `alnico_ternary.tdb` | Al-Ni-Ti, Al-Ni-Co | MatCalc mc_ni v2.034 |
| `mc_ni_v2.034.tdb` | Ni + 21 elements (full) | MatCalc mc_ni v2.034 |
| `COST507.tdb` | Al base | COST Action 507 |

Each carries source, license, citation and SHA-256 in
`data/databases/registry.json`; `scripts/prepare_tdb.py` regenerates the
cleaned full steel database from the pristine upstream file.

## Licensing note

The MatCalc open databases are **ODbL 1.0**: redistribution is permitted with
attribution and share-alike for derivative *databases* — keep the citation
and license fields intact when you redistribute extracts.
