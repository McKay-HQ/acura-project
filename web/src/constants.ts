import type { Container, Part, PartStatus, Phase } from './types';

export const STATUSES: PartStatus[] = ['Verified', 'Unverified', 'Unknown'];
export const isStatus = (value: string): value is PartStatus => STATUSES.some((status) => status === value);
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

export const isOtherCar = (fits: string | null | undefined): boolean => !!fits && fits !== 'RSX';
export const isForSale = (part: Pick<Part, 'tags'>): boolean => (part.tags || []).includes(FOR_SALE);
export const statusClass = (status: PartStatus): string => STATUS_CLASS[status] || 's-unv';
export const phaseClass = (phase: number): string =>
    ['', 'p-safety', 'p-soon', 'p-later', 'p-perf'][phase] || 'p-later';
/** Tags a part gets from the open tasks that use it, e.g. "Phase 1". */
export const phaseTags = (part: Pick<Part, 'phaseTags'>): string[] => part.phaseTags || [];
export const allTags = (part: Pick<Part, 'phaseTags' | 'tags'>): string[] => [...phaseTags(part), ...(part.tags || [])];

export const money = (amount: number): string =>
    `$${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export function valueRange(lo: number | null | undefined, hi: number | null | undefined): string {
    if (lo == null && hi == null) return 'Value TBD';
    if (lo != null && hi != null && Number(lo) !== Number(hi)) return `${money(lo)}–${money(hi)}`;
    return money(lo ?? hi ?? 0); // one of them is set here; `?? 0` only satisfies the type checker
}
export const sumLow = (list: Valued[]): number =>
    list.reduce((total, part) => total + (Number(part.valueLow ?? part.valueHigh) || 0), 0);
export const sumHigh = (list: Valued[]): number =>
    list.reduce((total, part) => total + (Number(part.valueHigh ?? part.valueLow) || 0), 0);

export const parseTags = (text: string): string[] => [
    ...new Set(
        String(text || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
    ),
];

export function fmtDate(date: string | null | undefined): string {
    if (!date) return '';
    const parsed = new Date(String(date).length === 10 ? `${date}T12:00:00` : date);
    return Number.isNaN(parsed.getTime())
        ? date
        : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const byOrder = (left: Container, right: Container): number =>
    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);

/** Containers: a part's container may be a sub-container; `top` is the container it sits inside. */
export const topContainers = (boxes: Container[]): Container[] =>
    boxes.filter((box) => !box.parentId || !boxes.some((other) => other.id === box.parentId)).sort(byOrder);
export const subContainers = (boxes: Container[], id: string): Container[] =>
    boxes.filter((box) => box.parentId === id).sort(byOrder);
export const partsInTree = (parts: Part[], boxes: Container[], id: string): Part[] => {
    const ids = new Set([id, ...subContainers(boxes, id).map((box) => box.id)]);
    return parts.filter((part) => part.container && ids.has(part.container.id));
};

/** Anything with an id and, optionally, a human-readable key. */
interface Ref {
    id: string;
    key?: string | null;
}

/** In-app links. Records with a human-readable key use it in the URL. */
export const href = {
    part: (part: Ref): string => `#part/${encodeURIComponent(part.key || part.id)}`,
    box: (box: Ref): string => `#container/${encodeURIComponent(box.key || box.id)}`,
    task: (task: Pick<Ref, 'id'>): string => `#task/${encodeURIComponent(task.id)}`,
};
export const findRef = <T extends Ref>(list: T[], ref: string | undefined): T | undefined =>
    list.find((item) => item.id === ref || item.key === ref);

/** True when an event target is inside an element matching the selector (e.g. a link or button in a card). */
export const isWithin = (target: EventTarget | null, selector: string): boolean =>
    target instanceof Element && target.closest(selector) !== null;
