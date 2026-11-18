# ELEMENT lines exported with H298/S298 = 0.0 for programmatically-added elements

## Summary

When elements are added to a `pycalphad.Database` **programmatically** (the
way ESPEI builds/optimizes databases), the exported TDB writes their
`ELEMENT` cards with mass, H298 and S298 all **0.0**. There is also no API on
`Database` to set those reference values, so the information cannot be
restored before export. Databases parsed *from file* round-trip their values
correctly — only the programmatic path loses them.

## Impact

Any downstream tool that trusts the `ELEMENT` card's SER reference state
enthalpy/entropy gets silently wrong values. We hit this with an
ESPEI-optimized γ′ database where the export contained:

```
ELEMENT CO BLANK 0.0 0.0 0.0 !
ELEMENT HF BLANK 0.0 0.0 0.0 !
```

while the same elements parsed from a text database keep their real values.

## Reproduction

```bash
python scripts/repro_export_bug.py
```

Output (pycalphad 0.12.0, Windows, Python 3.11):

```
== path A: parsed from TDB text, then exported ==
  ELEMENT CO BLANK 58.933 500.0 30.04 !
  ELEMENT HF BLANK 178.49 600.0 28.56 !

== path B: elements added programmatically, then exported ==
  ELEMENT CO BLANK 0.0 0.0 0.0 !
  ELEMENT HF BLANK 0.0 0.0 0.0 !
```

## Expected behavior

Either (a) the export raises / warns when reference data is missing, or
(b) `Database` exposes mass/H298/S298 storage that the TDB writer uses, so
programmatic workflows (ESPEI) can round-trip real reference states.

## Environment

- pycalphad 0.12.0 (also observed exporting 0.0 with 0.11.2 via ESPEI)
- Windows, Python 3.11 / 3.12
