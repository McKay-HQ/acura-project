export const STATUSES = ['Verified', 'Unverified', 'Unknown'];
export const PHASES = { 1: 'Before Driving', 2: 'Priority', 3: 'Non-Priority', 4: 'Performance' };
export const FITS = ['RSX', 'S2000', 'Civic', 'K-swap', 'Universal'];
export const SUGGESTED_TAGS = [
  'Body & trim', 'Electrical', 'Engine', 'Intake', 'Cooling', 'Brakes', 'Steering', 'Suspension', 'Hardware',
  'Spare', 'Potential sale', 'For sale', 'K-swap', 'RSX OEM', 'Ask Cody', 'Documents',
];
export const FOR_SALE = 'For sale';
export const OTHER_CARS = 'Other cars';
/** Tags listed first in the filter menu. */
export const PRIORITY_TAGS = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', FOR_SALE, 'Potential sale', 'Spare'];

export const isOtherCar = (f) => !!f && f !== 'RSX';
export const isForSale = (p) => (p.tags || []).includes(FOR_SALE);
export const statusClass = (s) => ({ Verified: 's-ok', Unverified: 's-unv', Unknown: 's-unk' })[s] || 's-unv';
export const phaseClass = (n) => ['', 'p-safety', 'p-soon', 'p-later', 'p-perf'][n] || 'p-later';
/** Tags a part gets from the open tasks that use it, e.g. "Phase 1". */
export const phaseTags = (p) => p.phaseTags || [];
export const allTags = (p) => [...phaseTags(p), ...(p.tags || [])];

export const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export function valueRange(lo, hi) {
  if (lo == null && hi == null) return 'Value TBD';
  if (lo != null && hi != null && Number(lo) !== Number(hi)) return `${money(lo)}–${money(hi)}`;
  return money(lo ?? hi);
}
export const sumLow = (list) => list.reduce((t, p) => t + (Number(p.valueLow ?? p.valueHigh) || 0), 0);
export const sumHigh = (list) => list.reduce((t, p) => t + (Number(p.valueHigh ?? p.valueLow) || 0), 0);

export const parseTags = (s) => [...new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean))];

export function fmtDate(d) {
  if (!d) return '';
  const t = new Date(String(d).length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Containers: a part's container may be a sub-container; `top` is the container it sits inside. */
export const topContainers = (boxes) => boxes.filter((b) => !b.parentId || !boxes.some((x) => x.id === b.parentId))
  .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
export const subContainers = (boxes, id) => boxes.filter((b) => b.parentId === id)
  .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
export const partsInTree = (parts, boxes, id) => {
  const ids = new Set([id, ...subContainers(boxes, id).map((b) => b.id)]);
  return parts.filter((p) => p.container && ids.has(p.container.id));
};

/** In-app links. Records with a human-readable key use it in the URL. */
export const href = {
  part: (p) => `#part/${encodeURIComponent(p.key || p.id)}`,
  box: (b) => `#container/${encodeURIComponent(b.key || b.id)}`,
  task: (t) => `#task/${encodeURIComponent(t.id)}`,
};
export const findRef = (list, ref) => list.find((x) => x.id === ref || x.key === ref);
