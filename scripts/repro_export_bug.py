#!/usr/bin/env python3
"""
repro_export_bug.py — minimal reproduction of the TDB ELEMENT export bug.

ESPEI (and any code that builds a Database programmatically) adds elements to
`Database.elements` without any place to record mass / H298 / S298. On export,
pycalphad then writes

    ELEMENT CO BLANK 0.0 0.0 0.0 !

i.e. the SER reference state is silently zeroed. Downstream consumers that
trust the ELEMENT card get a wrong reference state (observed in an
ESPEI-optimized database where CO and HF exported with 0.0 0.0 0.0 while
parse-from-file databases keep their real values).

Run with the repo venv:
    .venv/Scripts/python -E -s scripts/repro_export_bug.py
"""
from pycalphad import Database


def main() -> None:
    # --- path A: parse from file — values are preserved ---------------------
    from_file = Database(
        """
ELEMENT CO BLANK 58.933 500.0 30.04 !
ELEMENT HF BLANK 178.49 600.0 28.56 !
"""
    )
    print("== path A: parsed from TDB text, then exported ==")
    for line in from_file.to_string(fmt="tdb").splitlines():
        if line.upper().startswith("ELEMENT"):
            print("  " + line)

    # --- path B: elements added programmatically (the ESPEI path) ----------
    programmatic = Database()
    programmatic.elements = programmatic.elements | {"CO", "HF"}
    print("\n== path B: elements added programmatically, then exported ==")
    for line in programmatic.to_string(fmt="tdb").splitlines():
        if line.upper().startswith("ELEMENT"):
            print("  " + line)

    print(
        "\nBUG: path B exports H298/S298 (and mass) as 0.0, and the Database\n"
        "API offers no way to set the real values before export."
    )


if __name__ == "__main__":
    main()
