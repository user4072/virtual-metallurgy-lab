#!/usr/bin/env python3
"""
prepare_tdb.py — reproduce data/databases/mc_fe_v2.062.tdb from the pristine
MatCalc open database.

Provenance chain (same philosophy as the tttsteel project's make_clean_tdb.py):
  1. Read the original TU Wien MatCalc mc_fe_v2.062.tdb (ISO-8859-1 encoded).
  2. Convert to UTF-8 (lossless).
  3. Strip MatCalc-only statements that pycalphad cannot use:
       - REFERENCE_ELEMENT      (MatCalc metadata command)
       - ADD_COMPOSITION_SET    (composition-set variants; no parameter references them)
       - ATTACH_CONTRIBUTION    (ordered-variant declaration, unused by parameters)
       - PARAMETER HMVA ...     (vacancy formation enthalpies; pycalphad computes
                                 Gibbs energy G only and has no HM parameter type)
  4. Fix export artifacts in parameters:
       - `PARAMETER G(G_PHASE;FE:CU:SI;0)` semicolon typo → comma
       - doubled decimals `6000.00.00` → `6000.00`
       - duplicated range terminators `; 6000.00 N ; 6000.00 N` → single
       - stray `>> 1` and `>` markers before terminators (CONSTITUENT lines)
       - one REF: line shared by two consecutive PARAMETER statements → each
         statement gets its own REF copy
       - two-token references `REF:TEST KOZE10` → `REF:TEST_KOZE10`

All G / L / TC / BMAGN parameters are otherwise byte-identical to the original.

Usage:
  python scripts/prepare_tdb.py "<path to original mc_fe_v2.062.tdb>"
"""
import hashlib
import json
import re
import sys
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEST = os.path.join(REPO_ROOT, "data", "databases", "mc_fe_v2.062.tdb")
REGISTRY = os.path.join(REPO_ROOT, "data", "databases", "registry.json")

STRIP_STATEMENTS = (
    "REFERENCE_ELEMENT",
    "ADD_COMPOSITION_SET",
    "ATTACH_CONTRIBUTION",
    "PARAMETER HMVA",
)


def main(src_path: str) -> None:
    text = open(src_path, "rb").read().decode("iso-8859-1")
    lines = text.splitlines(keepends=True)

    # 1. statement-level strips (statement may span lines; ends at ';' or '!')
    out, skip, stripped = [], False, 0
    for line in lines:
        s = line.lstrip().upper()
        if not skip and any(s.startswith(k) for k in STRIP_STATEMENTS):
            skip = True
            stripped += 1
        if skip:
            if line.rstrip().endswith((";", "!")):
                skip = False
            continue
        out.append(line)
    text = "".join(out)

    # 2. one REF line shared by two consecutive PARAMETER statements
    shared_pat = re.compile(r"(PARAMETER [^\r\n]+ N)\r?\n(PARAMETER [^\r\n]+ N)\r?\n(REF:[^\r\n!]+ !)")
    n_shared = len(shared_pat.findall(text))
    text = shared_pat.sub(lambda m: f"{m.group(1)} {m.group(3)}\r\n{m.group(2)} {m.group(3)}", text)

    # 3. semicolon typo in a G_PHASE parameter
    n_typo = text.count("PARAMETER G(G_PHASE;FE:CU:SI;0)")
    text = text.replace("PARAMETER G(G_PHASE;FE:CU:SI;0)", "PARAMETER G(G_PHASE,FE:CU:SI;0)")

    # 4. doubled decimals
    n_dbl = len(re.findall(r"6000\.00\.00", text))
    text = text.replace("6000.00.00", "6000.00")

    # 5. duplicated range terminators
    n_dblrange = len(re.findall(r";\s*6000\.00\s+N\s*;\s*6000\.00\s+N", text))
    text = re.sub(r";\s*6000\.00\s+N\s*;\s*6000\.00\s+N", "; 6000.00  N", text)

    # 6. stray ">> 1" markers
    n_gt = len(re.findall(r">\s*>>\s*\d+", text))
    text = re.sub(r">\s*>>\s*\d+", ">", text)

    # 7. MatCalc '>' continuation markers inside CONSTITUENT lines
    n_const = len(re.findall(r"CONSTITUENT[^\r\n!]*>[ \t]*!", text))
    text = re.sub(r"(CONSTITUENT[^\r\n!]*)>[ \t]*!", lambda m: m.group(1).rstrip() + " !", text)

    # 8. two-token REF entries (never merge the '!' terminator)
    n_ref2 = len(re.findall(r"REF:\S+[ \t]+[^!\r\n]\S+", text))
    text = re.sub(r"REF:(\S+)[ \t]+([^!\r\n\s]\S*)", r"REF:\1_\2", text)

    # 8b. statements that end with a bare REF but no '!' terminator — the TDB
    #     line-joiner would otherwise swallow following lines (incl. the bare
    #     reference list at the end of the file, which has no '$' markers).
    n_noterm = len(re.findall(r"REF:[^\r\n!;]+[ \t]*\r?\n", text))
    text = re.sub(r"(REF:[^\r\n!;]+)[ \t]*\r?\n", r"\1 !\r\n", text)

    # 8c. the publication list at the end of the file is bare text (no '$'
    #     comment markers); pycalphad joins everything between '!' terminators,
    #     so it would be parsed as one giant command. Comment it out — it is
    #     metadata, not thermodynamic data.
    lines = text.splitlines(keepends=True)
    ref_start = None
    for i, line in enumerate(lines):
        if re.match(r"^A\d{5}-\d+", line):
            ref_start = i
            break
    n_refs_commented = 0
    if ref_start is not None:
        for i in range(ref_start, len(lines)):
            if lines[i].strip() and not lines[i].lstrip().startswith("$"):
                lines[i] = "$ " + lines[i].lstrip()
                n_refs_commented += 1
        text = "".join(lines)

    with open(DEST, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)

    print(f"stripped statements: {stripped}")
    print(f"shared-REF pairs fixed: {n_shared}")
    print(f"semicolon typos fixed: {n_typo}")
    print(f"doubled decimals fixed: {n_dbl}")
    print(f"duplicated ranges fixed: {n_dblrange}")
    print(f"'>>' junk fixed: {n_gt}")
    print(f"CONSTITUENT '>' markers removed: {n_const}")
    print(f"two-token REFs merged: {n_ref2}")
    print(f"missing terminators added: {n_noterm}")
    print(f"reference-list lines commented: {n_refs_commented}")

    from pycalphad import Database
    db = Database(DEST)
    print(f"PARSE OK — {len(db.phases)} phases")

    # 9. refresh the registry entry
    reg = json.load(open(REGISTRY, encoding="utf-8"))
    for d in reg["databases"]:
        if d["file"] == "mc_fe_v2.062.tdb":
            d["sha256"] = hashlib.sha256(open(DEST, "rb").read()).hexdigest()
            d["bytes"] = os.path.getsize(DEST)
            d["encoding_note"] = (
                "Converted from ISO-8859-1 to UTF-8 by scripts/prepare_tdb.py "
                "(reproducible provenance chain). Stripped MatCalc-only statements "
                "(REFERENCE_ELEMENT, ADD_COMPOSITION_SET, ATTACH_CONTRIBUTION, PARAMETER HMVA) "
                "and fixed small export artifacts (semicolon typo in one G_PHASE parameter, "
                "doubled decimals, duplicated range terminators, stray '>' continuation "
                "markers, a REF line shared by two PARAMETER statements, two-token REFs). "
                "All G/L/TC/BMAGN parameters otherwise unchanged."
            )
    with open(REGISTRY, "w", encoding="utf-8") as fh:
        json.dump(reg, fh, indent=2, ensure_ascii=False)
    print("registry updated")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
