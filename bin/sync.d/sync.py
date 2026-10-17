"""Two-way sync between the catalog (api/seed/seed.json + api/seed/photos) and the live app.

Each record is compared three ways: the catalog, the app, and the base (both sides as they were at
the last sync, kept in api/seed/sync-state.json). Changes made on one side are copied to the other;
when both sides changed, different fields are merged and a field changed on both sides to different
values is a conflict: reported, and that record is left alone on both sides. Writes to the app send
If-Match with the version just read, so an edit made in the app meanwhile is never overwritten (the
app answers 412 and the record is reported as a conflict).

See docs/sync-design.md. Run through bin/sync, which sets APP_URL, API_KEY, ROOT and DRY_RUN.
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
# Settle conflicts in favour of one side: "catalog", "app", or "" to report them and change nothing.
PREFER = os.environ.get("PREFER", "")
SEED = os.path.join(ROOT, "api", "seed")
SEED_FILE = os.path.join(SEED, "seed.json")
STATE_FILE = os.path.join(SEED, "sync-state.json")
PHOTOS = os.path.join(SEED, "photos")

# The catalog fields compared and synced per record type (catalog names; "photos" = ordered sources).
FIELDS = {
    "containers": ["name", "location", "notes", "icon", "order", "parent", "photos"],
    "parts": ["label", "partNumber", "fits", "status", "tags", "valueLow", "valueHigh", "notes", "container", "photos"],
    "tossed": ["label", "partNumber", "reason", "tossedOn", "photos"],
    "tasks": ["title", "phase", "notes", "steps", "done", "parts"],
    "notes": ["title", "items"],
}
HAS_PHOTOS = {"containers", "parts", "tossed"}
# Apply order: containers before the parts that point at them, parts before the tasks that list them.
ORDER = ["containers", "parts", "tossed", "tasks", "notes"]
LABEL = {"containers": "container", "parts": "part", "tossed": "tossed item", "tasks": "task", "notes": "note"}


class ApiError(Exception):
    def __init__(self, msg, status=None, body=None):
        super().__init__(msg)
        self.status = status
        self.body = body


class Stale(Exception):
    """The app answered 412: the record changed since it was read."""


# ---------------------------------------------------------------- HTTP

def call(method, path, body=None, files=None, version=None):
    headers = {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}
    if version is not None:
        headers["If-Match"] = f'"{version}"'
    data = None
    if files is not None:
        boundary = uuid.uuid4().hex
        chunks = []
        for f in files:
            name = os.path.basename(f)
            ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
            with open(f, "rb") as fh:
                chunks.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="photos"; filename="{name}"\r\n'
                    f"Content-Type: {ctype}\r\n\r\n".encode() + fh.read() + b"\r\n"
                )
        data = b"".join(chunks) + f"--{boundary}--\r\n".encode()
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
        except Exception:
            err = {}
        if e.code == 412:
            raise Stale() from None
        msg = err.get("error", e.reason) + (" " + "; ".join(err["details"]) if err.get("details") else "")
        raise ApiError(f"{method} {path}: {e.code} {msg}", e.code, err) from None
    except urllib.error.URLError as e:
        raise ApiError(f"could not reach {APP_URL}: {e.reason}") from None


def download(url_path, dest):
    req = urllib.request.Request(APP_URL + url_path)
    with urllib.request.urlopen(req, timeout=300) as res, open(dest + ".part", "wb") as out:
        out.write(res.read())
    os.replace(dest + ".part", dest)


def q(ref):
    return urllib.parse.quote(str(ref), safe="")


# ---------------------------------------------------------------- normalizing

# Values for fields added after a record was last synced: its stored base gets these, so a new
# field reads as "unchanged" on the side that doesn't have it yet.
NEW_FIELD_DEFAULTS = {"steps": []}


def norm_steps(steps):
    """Task steps in one canonical shape: {text, done} plus links/photos only when there are any."""
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


def from_catalog(kind, r):
    """The comparable fields of a catalog record."""
    v = {f: r.get(f) for f in FIELDS[kind]}
    for f in ("location", "notes", "partNumber", "fits", "reason"):
        if f in v:
            v[f] = v[f] or ""
    if kind == "containers":
        v["parent"] = v["parent"] or None
        v["icon"] = v["icon"] or "box"
        v["order"] = v["order"] or 0
    if kind == "parts":
        v["container"] = v["container"] or None
        v["tags"] = v["tags"] or []
    if kind == "tasks":
        v["done"] = bool(v["done"])
        v["parts"] = v["parts"] or []
        v["steps"] = norm_steps(v["steps"])
    if kind == "notes":
        v["items"] = v["items"] or []
    if kind in HAS_PHOTOS:
        v["photos"] = v["photos"] or []
    return v


def from_app(kind, r, key_of_container):
    """The same fields from an app record."""
    if kind == "containers":
        v = {"name": r["name"], "location": r.get("location") or "", "notes": r.get("notes") or "",
             "icon": r.get("icon") or "box", "order": r.get("sortOrder") or 0,
             "parent": key_of_container.get(r.get("parentId")) if r.get("parentId") else None}
    elif kind == "parts":
        v = {f: r.get(f) for f in ("label", "status", "valueLow", "valueHigh")}
        v.update({"partNumber": r.get("partNumber") or "", "fits": r.get("fits") or "", "tags": r.get("tags") or [],
                  "notes": r.get("notes") or "", "container": (r.get("container") or {}).get("key")})
    elif kind == "tossed":
        v = {"label": r["label"], "partNumber": r.get("partNumber") or "", "reason": r.get("reason") or "",
             "tossedOn": r.get("tossedOn")}
    elif kind == "tasks":
        v = {"title": r["title"], "phase": r["phase"], "notes": r.get("notes") or "",
             "steps": norm_steps(r.get("steps")), "done": bool(r.get("done")),
             "parts": [p.get("key") for p in r.get("parts", [])]}
    else:
        v = {"title": r["title"], "items": r.get("items") or []}
    if kind in HAS_PHOTOS:
        v["photos"] = [p.get("source") for p in r.get("photos", [])]
    return v


def to_app(kind, fields):
    """Catalog field values -> API body (photos are handled separately)."""
    m = {"order": "sortOrder", "parent": "parentId", "container": "containerId", "parts": "partIds"}
    return {m.get(k, k): v for k, v in fields.items() if k != "photos"}


# ---------------------------------------------------------------- the run

class Run:
    def __init__(self):
        with open(SEED_FILE, encoding="utf-8") as f:
            self.seed = json.load(f)
        self.state = {}
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, encoding="utf-8") as f:
                self.state = json.load(f)
        for kind, recs in self.state.items():
            for s in recs.values():
                for f in FIELDS.get(kind, []):
                    if isinstance(s.get("base"), dict) and f in NEW_FIELD_DEFAULTS:
                        s["base"].setdefault(f, NEW_FIELD_DEFAULTS[f])
        self.pushed = self.pulled = 0
        self.conflicts = []
        self.notes = []
        self.catalog_changed = False

    def say(self, direction, what):
        arrow = {"push": "catalog → app", "pull": "app → catalog"}[direction]
        print(f"  {'would ' if DRY else ''}{arrow}: {what}")
        if direction == "push":
            self.pushed += 1
        else:
            self.pulled += 1

    # ---- app side

    def load_app(self):
        self.app = {}
        self.dead = {}
        rows = {}
        for kind in ORDER:
            rows[kind] = call("GET", f"/{kind}?includeDeleted=1")
        self.key_of_container = {c["id"]: c.get("key") for c in rows["containers"]}
        for kind in ORDER:
            self.app[kind] = {}
            self.dead[kind] = {}
            for r in rows[kind]:
                if not r.get("key"):
                    self.notes.append(f"{LABEL[kind]} '{r.get('label') or r.get('name') or r.get('title')}' "
                                      "in the app has no key, so it can't be synced")
                    continue
                (self.dead if r.get("deletedAt") else self.app)[kind][r["key"]] = r

    # ---- one record type

    def sync_kind(self, kind):
        cat = {r["key"]: r for r in self.seed[kind] if r.get("key")}
        st = self.state.setdefault(kind, {})
        keys = list(cat) + [k for k in self.app[kind] if k not in cat] + \
            [k for k in st if k not in cat and k not in self.app[kind]]
        if kind == "containers":  # parents first, so sub-containers can point at them
            keys.sort(key=lambda k: bool((cat.get(k) or self.app[kind].get(k) or {}).get("parent")
                                         or (self.app[kind].get(k) or {}).get("parentId")))
        for key in keys:
            counts = (self.pushed, self.pulled)
            try:
                self.sync_record(kind, key, cat.get(key), st)
            except Stale:
                self.pushed, self.pulled = counts  # nothing was changed for this record
                self.conflicts.append(f"{LABEL[kind]} {key}: changed in the app while syncing; run sync again")

    def sync_record(self, kind, key, cat_rec, st):
        label = f"{LABEL[kind]} {key}"
        live = self.app[kind].get(key)
        c = from_catalog(kind, cat_rec) if cat_rec else None
        a = from_app(kind, live, self.key_of_container) if live else None
        s = st.get(key)

        if s is None:  # never synced
            if c is not None and a is not None:
                if c == a:
                    self.remember(st, key, live, a)
                else:
                    self.push_update(kind, key, label, live, a, c, st)
            elif c is not None:
                if key in self.dead[kind]:
                    self.conflicts.append(f"{label}: in the catalog but deleted in the app before it was ever synced")
                else:
                    self.push_create(kind, key, label, c, st)
            elif a is not None:
                self.pull(kind, key, label, a, live, st)
            return

        base = s["base"]
        c_changed = c != base
        a_changed = a != base
        if not c_changed and not a_changed:
            if live and live["version"] != s["version"]:
                self.remember(st, key, live, a)
            return
        if c_changed and not a_changed:
            if c is None:
                self.push_delete(kind, key, label, live, st)
            elif a is None:
                self.push_create(kind, key, label, c, st)
            else:
                self.push_update(kind, key, label, live, a, c, st)
            return
        if a_changed and not c_changed:
            if a is None:
                self.pull_delete(kind, key, label, st)
            else:
                self.pull(kind, key, label, a, live, st)
            return
        # both changed
        if c is None and a is None:
            st.pop(key, None)
            return
        if c is None or a is None:
            where = "catalog" if c is None else "app"
            if PREFER == "catalog":
                if c is None:
                    self.push_delete(kind, key, label, live, st)
                else:
                    self.push_create(kind, key, label, c, st)
            elif PREFER == "app":
                if a is None:
                    self.pull_delete(kind, key, label, st)
                else:
                    self.pull(kind, key, label, a, live, st)
            else:
                self.conflicts.append(f"{label}: deleted in the {where} but changed in the other")
            return
        merged, clash = {}, []
        for f in FIELDS[kind]:
            cv, av, bv = c[f], a[f], base.get(f)
            if cv == av or av == bv:
                merged[f] = cv
            elif cv == bv:
                merged[f] = av
            elif PREFER:
                merged[f] = cv if PREFER == "catalog" else av
            else:
                clash.append(f)
        if clash:
            self.conflicts.append(f"{label}: {', '.join(clash)} changed in both the catalog and the app")
            return
        if merged == a == c:
            self.remember(st, key, live, a)
            return
        if merged != a:
            self.push_update(kind, key, label, live, a, merged, st)
        if merged != c:
            self.set_catalog(kind, key, merged)
            self.say("pull", f"merge {label} ({', '.join(f for f in FIELDS[kind] if merged[f] != c[f])})")
            if merged == a:
                self.remember(st, key, live, a)

    # ---- state

    def remember(self, st, key, live, values):
        st[key] = {"version": live["version"], "base": values}

    # ---- catalog -> app

    def push_create(self, kind, key, label, c, st):
        self.say("push", f"create {label}")
        if DRY:
            return
        rec = call("POST", f"/{kind}", {"key": key, **to_app(kind, {f: v for f, v in c.items()})})
        if kind == "containers":
            self.key_of_container[rec["id"]] = key
        if kind in HAS_PHOTOS and c["photos"]:
            rec = self.push_photos(kind, key, rec, c["photos"])
        self.remember(st, key, rec, from_app(kind, rec, self.key_of_container))

    def push_update(self, kind, key, label, live, a, want, st):
        fields = {f: want[f] for f in FIELDS[kind] if f != "photos" and want[f] != a[f]}
        photos = kind in HAS_PHOTOS and want["photos"] != a["photos"]
        what = list(fields) + (["photos"] if photos else [])
        self.say("push", f"update {label} ({', '.join(what)})")
        if DRY:
            return
        rec = live
        if fields:
            rec = call("PATCH", f"/{kind}/{q(key)}", to_app(kind, fields), version=rec["version"])
        if photos:
            rec = self.push_photos(kind, key, rec, want["photos"])
        if kind == "containers":
            self.key_of_container[rec["id"]] = key
        self.remember(st, key, rec, from_app(kind, rec, self.key_of_container))

    def push_photos(self, kind, key, rec, wanted):
        have = [p.get("source") for p in rec.get("photos", [])]
        missing = [w for w in wanted if w not in have]
        for w in missing:
            if not os.path.isfile(os.path.join(PHOTOS, w)):
                raise ApiError(f"{LABEL[kind]} {key}: photo file api/seed/photos/{w} is missing")
        if missing:
            rec = call("POST", f"/{kind}/{q(key)}/photos", files=[os.path.join(PHOTOS, w) for w in missing],
                       version=rec["version"])
        for p in [p for p in rec["photos"] if p.get("source") not in wanted]:
            rec = call("DELETE", f"/photos/{p['id']}", version=rec["version"])
        by_source = {}
        for p in rec["photos"]:
            by_source.setdefault(p.get("source"), p["id"])
        ids = [by_source[w] for w in wanted if w in by_source]
        if [p["id"] for p in rec["photos"]] != ids:
            rec = call("PUT", f"/{kind}/{q(key)}/photos/order", {"ids": ids}, version=rec["version"])
        return rec

    def push_delete(self, kind, key, label, live, st):
        self.say("push", f"delete {label}")
        if DRY:
            return
        if live:
            call("DELETE", f"/{kind}/{q(key)}", version=live["version"])
        st.pop(key, None)

    # ---- app -> catalog

    def pull(self, kind, key, label, a, live, st):
        exists = any(r.get("key") == key for r in self.seed[kind])
        self.say("pull", f"{'update' if exists else 'add'} {label}")
        if DRY:
            return
        if kind in HAS_PHOTOS:
            for p in live.get("photos", []):
                dest = os.path.join(PHOTOS, p["source"])
                if not os.path.exists(dest):
                    download(p["url"], dest)
        self.set_catalog(kind, key, a)
        self.remember(st, key, live, a)

    def pull_delete(self, kind, key, label, st):
        self.say("pull", f"delete {label}")
        if DRY:
            return
        self.seed[kind] = [r for r in self.seed[kind] if r.get("key") != key]
        self.catalog_changed = True
        st.pop(key, None)

    def set_catalog(self, kind, key, values):
        if DRY:
            return
        for r in self.seed[kind]:
            if r.get("key") == key:
                r.update(values)
                break
        else:
            self.seed[kind].append({"key": key, **values})
        self.catalog_changed = True

    # ---- whole run

    def run(self):
        print(f"Syncing the catalog with {APP_URL}{' (dry run)' if DRY else ''}...")
        self.load_app()
        for kind in ORDER:
            self.sync_kind(kind)
        if not DRY:
            if self.catalog_changed:
                with open(SEED_FILE, "w", encoding="utf-8") as f:
                    json.dump(self.seed, f, indent=1, ensure_ascii=False)
                    f.write("\n")
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=1, ensure_ascii=False, sort_keys=True)
                f.write("\n")
        for n in self.notes:
            print(f"  note: {n}")
        for c in self.conflicts:
            print(f"  CONFLICT: {c}")
        total = self.pushed + self.pulled
        verb = "to make" if DRY else "made"
        if not total and not self.conflicts:
            print("Already in sync.")
        else:
            print(f"{self.pushed} change(s) catalog → app and {self.pulled} app → catalog {verb}"
                  f"{f'; {len(self.conflicts)} conflict(s) left alone' if self.conflicts else ''}.")
        # Exit 3 when there are conflicts, so callers can tell; bin/sync still commits what synced.
        return 3 if self.conflicts else 0


if __name__ == "__main__":
    try:
        sys.exit(Run().run())
    except ApiError as e:
        print(f"sync: {e}", file=sys.stderr)
        sys.exit(1)
