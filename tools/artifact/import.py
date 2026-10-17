"""Plan the artifact updates that bring it in line with the repo catalog (api/seed/seed.json).

This is the app -> artifact half of the sync (see docs/sync-design.md). Claude runs it in two steps:

  1. python3 -I tools/artifact/import.py uploads <dump dir> api/seed/seed.json
     Lists the catalog photos the artifact doesn't have yet (one file name per line). Claude uploads
     them from api/seed/photos/ as artifact assets and writes {file name: asset id} to a JSON file.

  2. python3 -I tools/artifact/import.py writes <dump dir> api/seed/seed.json <assets.json>
     Prints the database writes as JSON: [{op, collection, doc_id, data}], op = set (new doc),
     update (changed fields only, so fields the catalog doesn't carry are kept) or delete. Claude adds
     each doc's if_version from the dump listing and applies them with ArtifactData batch.

<dump dir> is an ArtifactData out_dir dump of the five collections (<dump>/<collection>/<doc id>.json).
Photos: an artifact doc lists asset ids; a photo whose catalog name isn't "<asset id>.jpg" (one that
came from the app) is recorded in the doc's `photoNames` map so the export gives it back its name.
"""
import glob
import json
import os
import sys

COLLECTIONS = ["containers", "parts", "tossed", "tasks", "notes"]


def norm_steps(steps):
    """Task steps as {text, done} plus links/photos when there are any (same shape as bin/sync.d/sync.py)."""
    out = []
    for s in steps or []:
        if isinstance(s, str):
            s = {"text": s}
        step = {"text": (s.get("text") or "").strip(), "done": bool(s.get("done"))}
        links = [{"label": l.get("label", ""), "href": l.get("href", "")} for l in s.get("links") or []]
        if links:
            step["links"] = links
        if s.get("photos"):
            step["photos"] = list(s["photos"])
        out.append(step)
    return out


def load_dump(dump):
    return {col: {os.path.basename(f)[:-5]: json.load(open(f, encoding="utf-8"))
                  for f in glob.glob(f"{dump}/{col}/*.json")} for col in COLLECTIONS}


def known_names(docs):
    """{catalog photo name: asset id} for every photo the artifact already holds."""
    names = {}
    for col in docs.values():
        for d in col.values():
            mapped = d.get("photoNames") or {}
            for a in d.get("photos") or []:
                names[mapped.get(a, a + ".jpg")] = a
    return names


def catalog_photos(seed):
    for col in ("containers", "parts", "tossed"):
        for r in seed[col]:
            yield from r.get("photos") or []


def to_doc(col, r, assets):
    """A catalog record as artifact doc fields (only the fields the catalog carries)."""
    ids = [assets[n] for n in r.get("photos") or []] if col in ("containers", "parts", "tossed") else None
    if col == "containers":
        d = {"name": r["name"], "location": r.get("location") or "", "notes": r.get("notes") or "",
             "parent": r.get("parent") or "", "icon": r.get("icon") or "box", "order": r.get("order") or 0}
    elif col == "parts":
        d = {"label": r["label"], "partNumber": r.get("partNumber") or "", "status": r["status"],
             "tags": r.get("tags") or [], "valueLow": r.get("valueLow"), "valueHigh": r.get("valueHigh"),
             "notes": r.get("notes") or "", "container": r.get("container") or ""}
        if r.get("fits"):
            d["fits"] = r["fits"]
    elif col == "tossed":
        d = {"label": r["label"], "partNumber": r.get("partNumber") or "", "reason": r.get("reason") or "",
             "tossedAt": r.get("tossedOn")}
    elif col == "tasks":
        d = {"title": r["title"], "phase": r["phase"], "notes": r.get("notes") or "", "done": bool(r.get("done")),
             "parts": r.get("parts") or [], "steps": norm_steps(r.get("steps"))}
    else:
        d = {"title": r["title"], "items": r.get("items") or []}
    if ids is not None:
        d["photos"] = ids
        extra = {a: n for a, n in zip(ids, r.get("photos") or []) if n != a + ".jpg"}
        d["photoNames"] = extra
    return d


def comparable(col, doc):
    """The same fields read back from an existing doc, normalized the same way."""
    d = {k: doc.get(k) for k in to_doc(col, {"name": "", "label": "", "title": "", "status": "", "phase": 1}, {}).keys()}
    if col == "containers":
        d["parent"] = d["parent"] or ""
        d["location"] = d["location"] or ""
        d["icon"] = d["icon"] or "box"
        d["order"] = d["order"] or 0
    if col == "parts":
        d["container"] = d["container"] or ""
        if doc.get("fits"):
            d["fits"] = doc["fits"]
    if col == "tasks":
        d["done"] = bool(d["done"])
        d["steps"] = norm_steps(d["steps"])
    if col in ("containers", "parts", "tossed"):
        d["photos"] = doc.get("photos") or []
        d["photoNames"] = {a: n for a, n in (doc.get("photoNames") or {}).items() if a in d["photos"]}
    for k in ("notes", "partNumber", "reason"):
        if k in d:
            d[k] = d[k] or ""
    for k in ("tags", "items", "parts"):
        if k in d:
            d[k] = d[k] or []
    return d


def main():
    mode, dump, seed_path = sys.argv[1:4]
    docs = load_dump(dump)
    seed = json.load(open(seed_path, encoding="utf-8"))
    have = known_names(docs)
    if mode == "uploads":
        for n in dict.fromkeys(catalog_photos(seed)):
            if n not in have:
                print(n)
        return
    assets = {**have, **json.load(open(sys.argv[4], encoding="utf-8"))}
    missing = [n for n in catalog_photos(seed) if n not in assets]
    if missing:
        sys.exit(f"not uploaded yet: {', '.join(missing)}")
    writes = []
    for col in COLLECTIONS:
        want = {r["key"]: to_doc(col, r, assets) for r in seed[col] if r.get("key")}
        for key, d in want.items():
            if key not in docs[col]:
                writes.append({"op": "set", "collection": col, "doc_id": key, "data": d})
                continue
            cur = comparable(col, docs[col][key])
            diff = {k: v for k, v in d.items() if cur.get(k) != v}
            if diff:
                writes.append({"op": "update", "collection": col, "doc_id": key, "data": diff})
        for key in docs[col]:
            if key not in want:
                writes.append({"op": "delete", "collection": col, "doc_id": key})
    json.dump(writes, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
