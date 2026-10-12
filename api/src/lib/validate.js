// Request validation. Each validator returns a clean object of only the fields that
// were provided, so it works for both create and partial update.
import { badRequest } from './errors.js';

export const STATUSES = ['Verified', 'Unverified', 'Unknown'];
export const PHASES = { 1: 'Before Driving', 2: 'Priority', 3: 'Non-Priority', 4: 'Performance' };
export const ICONS = ['trim', 'engine', 'electrical', 'other', 'askcody', 'none', 'hardware', 'box'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export const isUuid = (v) => UUID.test(String(v));

/** Route ids may be a UUID or a record's human-readable key (e.g. "injen-intake"). */
export function assertRef(ref, what = 'id') {
  const v = String(ref || '');
  if (!isUuid(v) && !KEY.test(v)) throw badRequest(`Invalid ${what}`);
  return v;
}

export function assertUuid(id, what = 'id') {
  if (!isUuid(id)) throw badRequest(`Invalid ${what}`);
  return id;
}

// Human names for fields, used in error messages shown in the app.
const NAMES = {
  label: 'Name', name: 'Name', partNumber: 'Part number', fits: 'Fits', status: 'Status', tags: 'Tags',
  valueLow: 'Low value', valueHigh: 'High value', notes: 'Notes', containerId: 'Container', key: 'Key',
  location: 'Location', reason: 'Reason', tossedOn: 'Tossed date', title: 'Title', phase: 'Phase', partIds: 'Parts', parentId: 'Inside', icon: 'Icon', sortOrder: 'Order',
  items: 'Items', done: 'Done',
};
const nm = (k) => NAMES[k] || k;

function text(body, key, errors, { required = false, max = 2000 } = {}) {
  if (!(key in body)) {
    if (required) errors.push(`${nm(key)} is required`);
    return undefined;
  }
  const v = body[key] == null ? '' : String(body[key]).trim();
  if (required && !v) errors.push(`${nm(key)} cannot be empty`);
  if (v.length > max) errors.push(`${nm(key)} is too long (max ${max} characters)`);
  return v;
}

function oneOf(body, key, allowed, errors) {
  if (!(key in body)) return undefined;
  if (!allowed.includes(body[key])) errors.push(`${nm(key)} must be one of: ${allowed.join(', ')}`);
  return body[key];
}

function money(body, key, errors) {
  if (!(key in body)) return undefined;
  const raw = body[key];
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 99999999) errors.push(`${nm(key)} must be a positive amount`);
  return Math.round(n * 100) / 100;
}

/** A list of short strings. Accepts a JSON array or a comma-separated string (from forms). */
function stringList(body, key, errors, { maxItems = 30, maxLen = 60, unique = true } = {}) {
  if (!(key in body)) return undefined;
  let v = body[key];
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try {
      v = v.trim().startsWith('[') ? JSON.parse(v) : v.split(',');
    } catch {
      errors.push(`${nm(key)} must be a list`);
      return undefined;
    }
  }
  if (!Array.isArray(v)) {
    errors.push(`${nm(key)} must be a list`);
    return undefined;
  }
  let out = v.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (unique) out = [...new Set(out)];
  if (out.length > maxItems) errors.push(`${nm(key)}: at most ${maxItems} entries`);
  if (out.some((x) => x.length > maxLen)) errors.push(`${nm(key)}: each entry must be at most ${maxLen} characters`);
  return out;
}

function dateOnly(body, key, errors) {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v == null || v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(v))) {
    errors.push(`${nm(key)} must be a date like 2026-10-06`);
  }
  return String(v);
}

function keyField(body, errors) {
  if (!('key' in body)) return undefined;
  if (body.key == null || body.key === '') return null;
  const v = String(body.key).trim().toLowerCase();
  if (!KEY.test(v) || isUuid(v)) errors.push('Key must be lowercase letters, numbers, dots, dashes or underscores');
  return v;
}

function intIn(body, key, errors, min, max) {
  if (!(key in body)) return undefined;
  const n = Number(body[key]);
  if (!Number.isInteger(n) || n < min || n > max) errors.push(`${nm(key)} must be a whole number from ${min} to ${max}`);
  return n;
}

/** A UUID-or-key reference; null/'' clears it. */
function ref(body, key, errors) {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!isUuid(s) && !KEY.test(s)) errors.push(`${nm(key)} must be an id or key`);
  return s;
}

function containerRef(body, errors) {
  // Accept containerId (UUID or key); null/'' clears it.
  const k = 'containerId' in body ? 'containerId' : 'container' in body ? 'container' : null;
  if (!k) return undefined;
  const v = body[k];
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!isUuid(s) && !KEY.test(s)) errors.push('Container must be a container id or key');
  return s;
}

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
function done(out, errors) {
  if (errors.length) throw badRequest('Check these fields:', errors);
  return out;
}

export function validatePart(body = {}, { create = false } = {}) {
  const errors = [];
  const out = compact({
    key: keyField(body, errors),
    label: text(body, 'label', errors, { required: create, max: 200 }),
    partNumber: text(body, 'partNumber', errors, { max: 300 }),
    fits: text(body, 'fits', errors, { max: 60 }),
    status: oneOf(body, 'status', STATUSES, errors),
    tags: stringList(body, 'tags', errors, { maxItems: 30, maxLen: 40 }),
    valueLow: money(body, 'valueLow', errors),
    valueHigh: money(body, 'valueHigh', errors),
    notes: text(body, 'notes', errors, { max: 5000 }),
    containerId: containerRef(body, errors),
  });
  if (out.valueLow != null && out.valueHigh != null && out.valueLow > out.valueHigh) {
    errors.push('Low value cannot be more than the high value');
  }
  return done(out, errors);
}

export function validateContainer(body = {}, { create = false } = {}) {
  const errors = [];
  const out = compact({
    key: keyField(body, errors),
    name: text(body, 'name', errors, { required: create, max: 120 }),
    location: text(body, 'location', errors, { max: 200 }),
    notes: text(body, 'notes', errors, { max: 5000 }),
    parentId: ref(body, 'parentId', errors),
    icon: oneOf(body, 'icon', ICONS, errors),
    sortOrder: intIn(body, 'sortOrder', errors, 0, 9999),
  });
  return done(out, errors);
}

export function validateTossed(body = {}, { create = false } = {}) {
  const errors = [];
  const out = compact({
    key: keyField(body, errors),
    label: text(body, 'label', errors, { required: create, max: 200 }),
    partNumber: text(body, 'partNumber', errors, { max: 300 }),
    reason: text(body, 'reason', errors, { max: 2000 }),
    tossedOn: dateOnly(body, 'tossedOn', errors),
  });
  return done(out, errors);
}

export function validateTask(body = {}, { create = false } = {}) {
  const errors = [];
  const out = compact({
    title: text(body, 'title', errors, { required: create, max: 200 }),
    phase: intIn(body, 'phase', errors, 1, 4),
    notes: text(body, 'notes', errors, { max: 5000 }),
    done: 'done' in body ? Boolean(body.done) : undefined,
    partIds: stringList(body, 'partIds', errors, { maxItems: 200, maxLen: 80 }),
  });
  if (out.partIds?.some((x) => !isUuid(x) && !KEY.test(x))) errors.push('Parts must be part ids or keys');
  return done(out, errors);
}

export function validateNote(body = {}, { create = false } = {}) {
  const errors = [];
  const out = compact({
    key: keyField(body, errors),
    title: text(body, 'title', errors, { required: create, max: 200 }),
    items: stringList(body, 'items', errors, { maxItems: 200, maxLen: 2000, unique: false }),
  });
  return done(out, errors);
}
