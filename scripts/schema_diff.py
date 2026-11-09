#!/usr/bin/env python3
"""Structural diff: legacy/intake/2026-11-06/depot_schema_only_sanitized.sql (new)
vs legacy/schema/legacy_mysql_schema.sql (old).

Parses CREATE TABLE columns + ALTER TABLE keys/AUTO_INCREMENT, normalizes
types, and emits a table/column/index drift report (JSON + console summary).
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
NEW_SQL = REPO / "legacy/intake/2026-11-06/depot_schema_only_sanitized.sql"
OLD_SQL = REPO / "legacy/schema/legacy_mysql_schema.sql"
OUT = REPO / "docs/migration/schema_drift.json"

CREATE_RE = re.compile(r"CREATE TABLE `(\w+)` \((.*?)\)\s*ENGINE", re.S)
ALTER_RE = re.compile(r"ALTER TABLE `(\w+)`\s*\n((?:\s+(?:ADD|MODIFY)[^\n]*\n)+)", re.S)
COL_RE = re.compile(r"^\s*`(\w+)` (\w+)(?:\(([^)]*)\))?(.*)$")


def norm_type(base, args):
    """int(11)->int, varchar(50)->varchar(50), keep length for strings."""
    base = base.lower()
    args = args or ""
    if base in ("int", "integer", "smallint", "tinyint", "mediumint", "bigint"):
        return base
    if base in ("varchar", "char", "varbinary"):
        return f"{base}({args.split(',')[0].strip()})" if args else base
    return base


def parse_cols(body):
    cols = {}
    parts, depth, buf = [], 0, ""
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(buf)
            buf = ""
        else:
            buf += ch
    if buf.strip():
        parts.append(buf)
    for p in parts:
        p = p.strip()
        if not p or p.startswith("PRIMARY KEY") or p.startswith("KEY ") or p.startswith("UNIQUE"):
            continue
        m = COL_RE.match(p)
        if not m:
            continue
        name, base, args, rest = m.groups()
        auto = "AUTO_INCREMENT" in rest
        nullable = "NOT NULL" not in rest
        dm = re.search(r"DEFAULT ('(?:[^'\\]|\\.)*'|[\w.-]+|NULL)", rest)
        default = dm.group(1) if dm else None
        cols[name] = {
            "type": norm_type(base, args),
            "nullable": nullable,
            "default": default,
            "auto_increment": auto,
        }
    return cols


def parse_sql(path):
    text = path.read_text()
    tables = {}
    for m in CREATE_RE.finditer(text):
        name, body = m.group(1), m.group(2)
        t = {"columns": parse_cols(body), "pk": None, "indexes": {}, "auto_inc_col": None}
        # inline keys (old schema style)
        for km in re.finditer(r"^\s*PRIMARY KEY \(([^)]+)\)", body, re.M):
            t["pk"] = tuple(c.strip("` ") for c in km.group(1).split(","))
        for km in re.finditer(r"^\s*(?:UNIQUE )?KEY `(\w+)` \(([^)]+)\)", body, re.M):
            t["indexes"][km.group(1)] = km.group(2).replace("`", "").replace(" ", "")
        tables[name] = t
    for m in ALTER_RE.finditer(text):
        name, block = m.group(1), m.group(2)
        t = tables.setdefault(name, {"columns": {}, "pk": None, "indexes": {}, "auto_inc_col": None})
        for pm in re.finditer(r"ADD PRIMARY KEY \(([^)]+)\)", block):
            t["pk"] = tuple(c.strip("` ") for c in pm.group(1).split(","))
        for pm in re.finditer(r"ADD (?:UNIQUE )?KEY `(\w+)` \(([^)]+)\)", block):
            t["indexes"][pm.group(1)] = pm.group(2).replace("`", "").replace(" ", "")
        for pm in re.finditer(r"MODIFY `(\w+)` .*AUTO_INCREMENT", block):
            t["auto_inc_col"] = pm.group(1)
    # inline AUTO_INCREMENT in old-style CREATE (col rest contains AUTO_INCREMENT)
    for name, t in tables.items():
        if t["auto_inc_col"] is None:
            for c, meta in t["columns"].items():
                if meta["auto_increment"]:
                    t["auto_inc_col"] = c
                    break
    return tables


def main():
    new = parse_sql(NEW_SQL)
    old = parse_sql(OLD_SQL)
    only_old = sorted(set(old) - set(new))
    only_new = sorted(set(new) - set(old))
    common = sorted(set(old) & set(new))
    drift = {"only_in_old": only_old, "only_in_new": only_new,
             "table_count": {"old": len(old), "new": len(new), "common": len(common)},
             "tables": {}}
    n_col_changes = n_idx_changes = 0
    for tname in common:
        o, n = old[tname], new[tname]
        cols_old, cols_new = o["columns"], n["columns"]
        added = sorted(set(cols_new) - set(cols_old))
        removed = sorted(set(cols_old) - set(cols_new))
        changed = {}
        for c in sorted(set(cols_old) & set(cols_new)):
            a, b = cols_old[c], cols_new[c]
            d = {}
            if a["type"] != b["type"]:
                d["type"] = [a["type"], b["type"]]
            if a["nullable"] != b["nullable"]:
                d["nullable"] = [a["nullable"], b["nullable"]]
            if a["default"] != b["default"]:
                d["default"] = [a["default"], b["default"]]
            if d:
                changed[c] = d
        idx_added = sorted(set(n["indexes"]) - set(o["indexes"]))
        idx_removed = sorted(set(o["indexes"]) - set(n["indexes"]))
        idx_def_changed = {k: [o["indexes"][k], n["indexes"][k]]
                           for k in sorted(set(o["indexes"]) & set(n["indexes"]))
                           if o["indexes"][k] != n["indexes"][k]}
        pk_changed = (o["pk"] != n["pk"]) and (o["pk"] is not None or n["pk"] is not None)
        tdrift = {"columns_added": added, "columns_removed": removed,
                  "columns_changed": changed, "indexes_added": idx_added,
                  "indexes_removed": idx_removed, "indexes_def_changed": idx_def_changed,
                  "pk_changed": {"old": list(o["pk"] or ()), "new": list(n["pk"] or ())} if pk_changed else None}
        drift["tables"][tname] = tdrift
        n_col_changes += len(added) + len(removed) + len(changed)
        n_idx_changes += len(idx_added) + len(idx_removed) + len(idx_def_changed)
    OUT.write_text(json.dumps(drift, indent=1))
    # console summary
    print(f"old tables: {len(old)}  new tables: {len(new)}  common: {len(common)}")
    print(f"only in old: {only_old}")
    print(f"only in new: {only_new}")
    ident = [t for t, d in drift['tables'].items()
             if not (d['columns_added'] or d['columns_removed'] or d['columns_changed']
                     or d['indexes_added'] or d['indexes_removed'] or d['indexes_def_changed'] or d['pk_changed'])]
    print(f"structurally identical tables (cols+idx): {len(ident)}/{len(common)}")
    print(f"total column drift events: {n_col_changes}; index drift events: {n_idx_changes}")
    print("\n-- tables WITH drift --")
    for t, d in drift["tables"].items():
        bits = []
        if d["columns_added"]:
            bits.append(f"+cols {d['columns_added']}")
        if d["columns_removed"]:
            bits.append(f"-cols {d['columns_removed']}")
        if d["columns_changed"]:
            bits.append(f"~cols {json.dumps(d['columns_changed'])}")
        if d["indexes_added"]:
            bits.append(f"+idx {d['indexes_added']}")
        if d["indexes_removed"]:
            bits.append(f"-idx {d['indexes_removed']}")
        if d["indexes_def_changed"]:
            bits.append(f"~idx {json.dumps(d['indexes_def_changed'])}")
        if d["pk_changed"]:
            bits.append(f"pk {d['pk_changed']}")
        if bits:
            print(f"  {t}: " + "; ".join(bits))


if __name__ == "__main__":
    sys.exit(main())
