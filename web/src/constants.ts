import type { Container, Part, PartStatus, Phase } from './types';

export const STATUSES: PartStatus[] = ['Verified', 'Unverified', 'Unknown'];
export const isStatus = (s: string): s is PartStatus => STATUSES.some((x) => x === s);
export const PHASES: Record<Phase, string> = {
    1: 'Before Driving',
    2: 'Priority',
    3: 'Non-Priority',
    4: 'Performance',
};
export const PHASE_NUMBERS: readonly Phase[] = [1, 2, 3, 4];
export const FITS = ['RSX', 'S2000', 'Civic', 'K-swap', 'Universal'];
export const SUGGESTED_TAGS = [
    'Body & trim',
    'Electrical',
    'Engine',
    'Intake',
    'Cooling',
    'Brakes',
    'Steering',
    'Suspension',
    'Hardware',
    'Spare',
    'Potential sale',
    'For sale',
    'K-swap',
    'RSX OEM',
    'Ask Cody',
    'Documents',
];
export const FOR_SALE = 'For sale';
export const OTHER_CARS = 'Other cars';
/** Tags listed first in the filter menu. */
export const PRIORITY_TAGS = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', FOR_SALE, 'Potential sale', 'Spare'];

/** Fields needed to total up value ranges. */
type Valued = Pick<Part, 'valueLow' | 'valueHigh'>;

const STATUS_CLASS: Record<PartStatus, string> = { Verified: 's-ok', Unverified: 's-unv', Unknown: 's-unk' };

export const isOtherCar = (f: string | null | undefined): boolean => !!f && f !== 'RSX';
export const isForSale = (p: Pick<Part, 'tags'>): boolean => (p.tags || []).includes(FOR_SALE);
export const statusClass = (s: PartStatus): string => STATUS_CLASS[s] || 's-unv';
export const phaseClass = (n: number): string => ['', 'p-safety', 'p-soon', 'p-later', 'p-perf'][n] || 'p-later';
/** Tags a part gets from the open tasks that use it, e.g. "Phase 1". */
export const phaseTags = (p: Pick<Part, 'phaseTags'>): string[] => p.phaseTags || [];
export const allTags = (p: Pick<Part, 'phaseTags' | 'tags'>): string[] => [...phaseTags(p), ...(p.tags || [])];

export const money = (n: number): string => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export function valueRange(lo: number | null | undefined, hi: number | null | undefined): string {
    if (lo == null && hi == null) return 'Value TBD';
    if (lo != null && hi != null && Number(lo) !== Number(hi)) return `${money(lo)}–${money(hi)}`;
    return money(lo ?? hi ?? 0); // one of them is set here; `?? 0` only satisfies the type checker
}
export const sumLow = (list: Valued[]): number =>
    list.reduce((t, p) => t + (Number(p.valueLow ?? p.valueHigh) || 0), 0);
export const sumHigh = (list: Valued[]): number =>
    list.reduce((t, p) => t + (Number(p.valueHigh ?? p.valueLow) || 0), 0);

export const parseTags = (s: string): string[] => [
    ...new Set(
        String(s || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
    ),
];

export function fmtDate(d: string | null | undefined): string {
    if (!d) return '';
    const t = new Date(String(d).length === 10 ? `${d}T12:00:00` : d);
    return Number.isNaN(t.getTime())
        ? d
        : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const byOrder = (a: Container, b: Container): number => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** Containers: a part's container may be a sub-container; `top` is the container it sits inside. */
export const topContainers = (boxes: Container[]): Container[] =>
    boxes.filter((b) => !b.parentId || !boxes.some((x) => x.id === b.parentId)).sort(byOrder);
export const subContainers = (boxes: Container[], id: string): Container[] =>
    boxes.filter((b) => b.parentId === id).sort(byOrder);
export const partsInTree = (parts: Part[], boxes: Container[], id: string): Part[] => {
    const ids = new Set([id, ...subContainers(boxes, id).map((b) => b.id)]);
    return parts.filter((p) => p.container && ids.has(p.container.id));
};

/** Anything with an id and, optionally, a human-readable key. */
interface Ref {
    id: string;
    key?: string | null;
}

/** In-app links. Records with a human-readable key use it in the URL. */
export const href = {
    part: (p: Ref): string => `#part/${encodeURIComponent(p.key || p.id)}`,
    box: (b: Ref): string => `#container/${encodeURIComponent(b.key || b.id)}`,
    task: (t: Pick<Ref, 'id'>): string => `#task/${encodeURIComponent(t.id)}`,
};
export const findRef = <T extends Ref>(list: T[], ref: string | undefined): T | undefined =>
    list.find((x) => x.id === ref || x.key === ref);

/** True when an event target is inside an element matching the selector (e.g. a link or button in a card). */
export const isWithin = (target: EventTarget | null, selector: string): boolean =>
    target instanceof Element && target.closest(selector) !== null;
