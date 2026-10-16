"""Convert a dump of the artifact's database into the repo catalog (api/seed/seed.json).

The dump is what Claude's ArtifactData tool writes with out_dir: <dump>/<collection>/<doc id>.json.
Photos are asset ids in the artifact; in the catalog they are file names. A doc's optional
`photoNames` map ({asset id: file name}) keeps names that came from the app; otherwise the name is
"<asset id>.jpg". Record order follows the existing seed.json, with new records appended.

Usage: python3 -I tools/artifact/export.py <dump dir> api/seed/seed.json > new-seed.json
"""
import glob
import json
import os
import sys


def main(dump, old_path):
    old = json.load(open(old_path, encoding="utf-8"))

    def docs(col):
        return {os.path.basename(f)[:-5]: json.load(open(f, encoding="utf-8")) for f in glob.glob(f"{dump}/{col}/*.json")}

    def photos(d):
        names = d.get("photoNames") or {}
        return [names.get(a, a + ".jpg") for a in d.get("photos") or []]

    def ordered(col, new):
        keys = [r["key"] for r in old.get(col, []) if r.get("key") in new]
        return keys + sorted(k for k in new if k not in keys)

    out = {"version": old.get("version", 3)}
    c = docs("containers")
    out["containers"] = [
        {"key": k, "name": d["name"], "location": d.get("location", ""), "notes": d.get("notes", ""),
         "parent": d.get("parent") or None, "icon": d.get("icon") or "box", "order": d.get("order", 0),
         "photos": photos(d), "createdAt": d.get("addedAt")}
        for k in ordered("containers", c) for d in [c[k]]
    ]
    p = docs("parts")
    out["parts"] = [
        {"key": k, "label": d["label"], "partNumber": d.get("partNumber", ""), "fits": d.get("fits", ""),
         "status": d["status"], "tags": d.get("tags", []), "valueLow": d.get("valueLow"),
         "valueHigh": d.get("valueHigh"), "notes": d.get("notes", ""), "container": d.get("container") or None,
         "photos": photos(d), "createdAt": d.get("addedAt")}
        for k in ordered("parts", p) for d in [p[k]]
    ]
    t = docs("tossed")
    out["tossed"] = [
        {"key": k, "label": d["label"], "partNumber": d.get("partNumber", ""), "reason": d.get("reason", ""),
         "tossedOn": d.get("tossedAt"), "sortOrder": d.get("order", 0), "photos": photos(d)}
        for k in ordered("tossed", t) for d in [t[k]]
    ]
    tk = docs("tasks")
    out["tasks"] = [
        {"key": k, "title": d["title"], "phase": d["phase"], "notes": d.get("notes", ""), "done": bool(d.get("done")),
         "parts": d.get("parts", []), "createdAt": d.get("addedAt")}
        for k in ordered("tasks", tk) for d in [tk[k]]
    ]
    n = docs("notes")
    out["notes"] = [
        {"key": k, "title": d["title"], "items": d.get("items", []), "createdAt": d.get("addedAt")}
        for k in ordered("notes", n) for d in [n[k]]
    ]
    json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
