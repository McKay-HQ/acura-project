"""Make the live app match the catalog in api/seed/seed.json.

Compares records by key (tasks by title) and applies only the differences through the app's API:
fields, container nesting, task parts, and photos. Photos are recognized by their source name
("<catalog id>.jpg"); missing ones are uploaded from api/seed/photos, extra ones deleted, and the
order fixed. Records in the app that aren't in the catalog are reported and left alone.

Run through bin/sync, which sets APP_URL, API_KEY, ROOT and DRY_RUN.
"""
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

APP_URL = os.environ["APP_URL"].rstrip("/")
API_KEY = os.environ.get("API_KEY", "")
ROOT = os.environ["ROOT"]
DRY = os.environ.get("DRY_RUN") == "1"
SEED = os.path.join(ROOT, "api", "seed")

changes = 0


class ApiError(Exception):
    pass


def call(method, path, body=None, files=None):
    """JSON in and out. `files` sends multipart/form-data with each file under "photos"."""
    headers = {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}
    data = None
    if files is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for f in files:
            name = os.path.basename(f)
            ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
            with open(f, "rb") as fh:
                parts.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="photos"; filename="{name}"\r\n'
                    f"Content-Type: {ctype}\r\n\r\n".encode() + fh.read() + b"\r\n"
                )
        data = b"".join(parts) + f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(APP_URL + "/api" + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read())
            msg = err.get("error", "") + (" " + "; ".join(err["details"]) if err.get("details") else "")
        except Exception:
            msg = e.reason
        raise ApiError(f"{method} {path}: {e.code} {msg}") from None
    except urllib.error.URLError as e:
        raise ApiError(f"could not reach {APP_URL}: {e.reason}") from None


def q(ref):
    return urllib.parse.quote(str(ref), safe="")


def change(what):
    global changes
    changes += 1
    print(("  would " if DRY else "  ") + what)


def sync_fields(kind, ref, label, live, want):
    """PATCH the fields whose live value differs from the wanted one."""
    diff = {k: v for k, v in want.items() if live.get(k) != v}
    if not diff:
        return
    names = ", ".join(diff)
    change(f"update {label}: {names}")
    if not DRY:
        call("PATCH", f"/{kind}/{q(ref)}", diff)


def sync_photos(kind, ref, label, live_photos, wanted):
    """Make a record's photos the wanted catalog files, in order."""
    have = [p.get("source") for p in live_photos]
    if have == wanted:
        return
    missing = [w for w in wanted if w not in have]
    extra = [p for p in live_photos if p.get("source") not in wanted]
    for w in missing:
        if not os.path.isfile(os.path.join(SEED, "photos", w)):
            raise ApiError(f"{label}: photo file api/seed/photos/{w} is missing")
    bits = []
    if missing:
        bits.append(f"add {len(missing)}")
    if extra:
        bits.append(f"remove {len(extra)}")
    if not bits:
        bits.append("reorder")
    change(f"photos of {label}: {', '.join(bits)}")
    if DRY:
        return
    record = None
    if missing:
        record = call("POST", f"/{kind}/{q(ref)}/photos", files=[os.path.join(SEED, "photos", w) for w in missing])
    for p in extra:
        record = call("DELETE", f"/photos/{p['id']}")
    record = record or call("GET", f"/{kind}/{q(ref)}")
    by_source = {}
    for p in record["photos"]:
        by_source.setdefault(p.get("source"), p["id"])
    ids = [by_source[w] for w in wanted if w in by_source]
    if [p["id"] for p in record["photos"]] != ids:
        call("PUT", f"/{kind}/{q(ref)}/photos/order", {"ids": ids})


def report_extra(kind, live_keys, seed_keys):
    for k in sorted(k for k in live_keys if k not in seed_keys):
        print(f"  note: {kind} '{k}' is in the app but not in the catalog (left alone)")


def main():
    with open(os.path.join(SEED, "seed.json"), encoding="utf-8") as f:
        seed = json.load(f)
    print(f"Comparing the catalog with {APP_URL}{' (dry run)' if DRY else ''}...")

    # ---- containers: top-level first so sub-containers can point at them ----
    live = {c["key"]: c for c in call("GET", "/containers") if c.get("key")}
    key_of = {c["id"]: c["key"] for c in live.values()}
    for c in sorted(seed["containers"], key=lambda c: bool(c.get("parent"))):
        want = {"name": c["name"], "location": c.get("location") or "", "notes": c.get("notes") or "",
                "icon": c.get("icon") or "box", "sortOrder": c.get("order") or 0}
        label = f"container {c['key']}"
        if c["key"] not in live:
            change(f"create {label}")
            if not DRY:
                live[c["key"]] = call("POST", "/containers", {"key": c["key"], **want, "parentId": c.get("parent")})
                key_of[live[c["key"]]["id"]] = c["key"]
            else:
                live[c["key"]] = {"photos": [], "parentId": None, **want}
                continue
        cur = live[c["key"]]
        sync_fields("containers", c["key"], label, cur, want)
        parent_now = key_of.get(cur.get("parentId")) if cur.get("parentId") else None
        if parent_now != (c.get("parent") or None):
            change(f"move {label} {'into ' + c['parent'] if c.get('parent') else 'to the top level'}")
            if not DRY:
                call("PATCH", f"/containers/{q(c['key'])}", {"parentId": c.get("parent")})
        sync_photos("containers", c["key"], label, cur.get("photos", []), c.get("photos") or [])
    report_extra("container", live, {c["key"] for c in seed["containers"]})

    # ---- parts ----
    live = {p["key"]: p for p in call("GET", "/parts") if p.get("key")}
    for p in seed["parts"]:
        want = {"label": p["label"], "partNumber": p.get("partNumber") or "", "fits": p.get("fits") or "",
                "status": p["status"], "tags": p.get("tags") or [], "valueLow": p.get("valueLow"),
                "valueHigh": p.get("valueHigh"), "notes": p.get("notes") or ""}
        label = f"part {p['key']}"
        if p["key"] not in live:
            change(f"create {label}")
            if DRY:
                continue
            live[p["key"]] = call("POST", "/parts", {"key": p["key"], **want, "containerId": p.get("container") or None})
        cur = live[p["key"]]
        sync_fields("parts", p["key"], label, cur, want)
        box_now = (cur.get("container") or {}).get("key")
        if box_now != (p.get("container") or None):
            change(f"move {label} to {p.get('container') or 'no container'}")
            if not DRY:
                call("PATCH", f"/parts/{q(p['key'])}", {"containerId": p.get("container") or None})
        sync_photos("parts", p["key"], label, cur.get("photos", []), p.get("photos") or [])
    report_extra("part", live, {p["key"] for p in seed["parts"]})

    # ---- tossed ----
    live = {t["key"]: t for t in call("GET", "/tossed") if t.get("key")}
    for t in seed["tossed"]:
        want = {"label": t["label"], "partNumber": t.get("partNumber") or "", "reason": t.get("reason") or "",
                "tossedOn": t.get("tossedOn")}
        label = f"tossed {t['key']}"
        if t["key"] not in live:
            change(f"create {label}")
            if DRY:
                continue
            live[t["key"]] = call("POST", "/tossed", {"key": t["key"], **want})
        sync_fields("tossed", t["key"], label, live[t["key"]], want)
        sync_photos("tossed", t["key"], label, live[t["key"]].get("photos", []), t.get("photos") or [])
    report_extra("tossed item", live, {t["key"] for t in seed["tossed"]})

    # ---- tasks (matched by title) ----
    live = {t["title"]: t for t in call("GET", "/tasks")}
    for t in seed["tasks"]:
        want = {"phase": t["phase"], "notes": t.get("notes") or "", "done": bool(t.get("done"))}
        parts = t.get("parts") or []
        label = f"task '{t['title']}'"
        if t["title"] not in live:
            change(f"create {label}")
            if not DRY:
                call("POST", "/tasks", {"title": t["title"], **want, "partIds": parts})
            continue
        cur = live[t["title"]]
        sync_fields("tasks", cur["id"], label, cur, want)
        if [x.get("key") for x in cur.get("parts", [])] != parts:
            change(f"update {label}: parts")
            if not DRY:
                call("PATCH", f"/tasks/{cur['id']}", {"partIds": parts})
    report_extra("task", live, {t["title"] for t in seed["tasks"]})

    # ---- notes ----
    live = {n["key"]: n for n in call("GET", "/notes") if n.get("key")}
    for n in seed["notes"]:
        want = {"title": n["title"], "items": n.get("items") or []}
        label = f"note {n['key']}"
        if n["key"] not in live:
            change(f"create {label}")
            if not DRY:
                call("POST", "/notes", {"key": n["key"], **want})
            continue
        sync_fields("notes", n["key"], label, live[n["key"]], want)
    report_extra("note", live, {n["key"] for n in seed["notes"]})

    if not changes:
        print("Already in sync.")
    elif DRY:
        print(f"{changes} change(s) to make. Run without -n to apply them.")
    else:
        print(f"Done: {changes} change(s) applied.")


if __name__ == "__main__":
    try:
        main()
    except ApiError as e:
        print(f"sync: {e}", file=sys.stderr)
        sys.exit(1)
