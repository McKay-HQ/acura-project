// Domain models exactly as the API returns them (see api/src/services/*.ts and api/src/routes.ts).
// Timestamps (createdAt, updatedAt, doneAt) are ISO strings after JSON encoding; DATE columns
// (tossedOn) come back as 'YYYY-MM-DD'; NUMERIC values (valueLow/High) are parsed to numbers.

export type PartStatus = 'Verified' | 'Unverified' | 'Unknown';
export type Phase = 1 | 2 | 3 | 4;
/** Container icon names the API accepts (api lib/validate ICONS). */
export type ContainerIcon = 'trim' | 'engine' | 'electrical' | 'other' | 'askcody' | 'none' | 'hardware' | 'box';

export interface Photo {
    id: string;
    url: string;
    thumbUrl: string;
    width: number | null;
    height: number | null;
    source: string | null;
}

/** The container a part is in, as embedded on a part. */
export interface ContainerRef {
    id: string;
    key: string | null;
    name: string;
    icon: ContainerIcon;
    /** The top-level container: the parent for a sub-container, otherwise the container itself. */
    top: {
        id: string;
        key: string | null;
        name: string;
        icon: ContainerIcon;
    };
}

/** A task as embedded on a part. */
export interface PartTaskRef {
    id: string;
    title: string;
    phase: Phase;
    done: boolean;
}

export interface Part {
    id: string;
    key: string | null;
    /** Bumped by the API on every change; sent back as If-Match on writes. */
    version: number;
    label: string;
    partNumber: string;
    fits: string;
    status: PartStatus;
    tags: string[];
    valueLow: number | null;
    valueHigh: number | null;
    notes: string;
    container: ContainerRef | null;
    tasks: PartTaskRef[];
    /** "Phase 1".."Phase 4", from the open tasks that use this part. */
    phaseTags: string[];
    photos: Photo[];
    createdAt: string;
    updatedAt: string;
}

/** A part as embedded on a container (parts directly inside it, not its sub-containers). */
export interface ContainerPartRef {
    id: string;
    key: string | null;
    label: string;
    status: PartStatus;
}

export interface Container {
    id: string;
    key: string | null;
    /** Bumped by the API on every change; sent back as If-Match on writes. */
    version: number;
    name: string;
    location: string;
    notes: string;
    parentId: string | null;
    icon: ContainerIcon;
    sortOrder: number;
    photos: Photo[];
    parts: ContainerPartRef[];
    partCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface Tossed {
    id: string;
    key: string | null;
    /** Bumped by the API on every change; sent back as If-Match on writes. */
    version: number;
    label: string;
    partNumber: string;
    reason: string;
    tossedOn: string | null;
    photos: Photo[];
    createdAt: string;
    updatedAt: string;
}

/** A part as embedded on a task. */
export interface TaskPartRef {
    id: string;
    key: string | null;
    label: string;
    partNumber: string;
    status: PartStatus;
}

/** A link from a task step: a page in the app (#part/..., #task/...) or an https URL. */
export interface StepLink {
    label: string;
    href: string;
}

/** One step of a task's instructions. photos refer to The Car tab's photos, e.g. "engine:03". */
export interface TaskStep {
    text: string;
    done: boolean;
    links?: StepLink[];
    photos?: string[];
}

export interface Task {
    id: string;
    key: string | null;
    /** Bumped by the API on every change; sent back as If-Match on writes. */
    version: number;
    title: string;
    phase: Phase;
    notes: string;
    /** Instructions; when there are any, done is true exactly when every step is. */
    steps: TaskStep[];
    done: boolean;
    doneAt: string | null;
    parts: TaskPartRef[];
    createdAt: string;
    updatedAt: string;
}

export interface Note {
    id: string;
    key: string | null;
    /** Bumped by the API on every change; sent back as If-Match on writes. */
    version: number;
    title: string;
    items: string[];
    createdAt: string;
    updatedAt: string;
}

export interface Expense {
    id: string;
    key: string | null;
    /** Bumped by the API on every change; sent back as If-Match on writes. */
    version: number;
    label: string;
    vendor: string;
    /** Dollars, everything included. */
    price: number;
    /** False for something planned or not paid yet. */
    paid: boolean;
    paidOn: string | null;
    notes: string;
    createdAt: string;
    updatedAt: string;
}

/** Any record the API versions (optimistic locking). */
export type VersionedRecord = Part | Container | Tossed | Task | Note | Expense;

export interface Summary {
    parts: { total: number; verified: number; unverified: number; unknown: number };
    value: { low: number; high: number };
    forSale: { count: number; low: number; high: number };
    containers: number;
    tossed: number;
    tasks: { open: number; total: number };
}

export interface AppConfig {
    keyRequiredForChanges: boolean;
    keyRequiredForReads: boolean;
    statuses: PartStatus[];
    /** JSON object keys are strings ("1".."4"); numeric indexing works the same. */
    phases: Record<Phase, string>;
    icons: ContainerIcon[];
    maxUploadMb: number;
}

export interface TagCount {
    tag: string;
    count: number;
}

// ---- Request bodies ----
// These are type aliases (not interfaces) so they are assignable to the FormData field record in api.ts.

export type PartInput = {
    label: string;
    partNumber: string;
    status: PartStatus;
    fits: string;
    tags: string[];
    valueLow: number | null;
    valueHigh: number | null;
    containerId: string | null;
    notes: string;
};

export type ContainerInput = {
    name: string;
    location: string;
    notes: string;
    icon: ContainerIcon;
    parentId?: string | null;
};

export type TossedInput = {
    label: string;
    partNumber: string;
    reason: string;
    tossedOn: string | null;
};

export type ExpenseInput = {
    label: string;
    vendor: string;
    price: number | null;
    paid: boolean;
    paidOn: string | null;
    notes: string;
};

export type TaskInput = {
    title: string;
    phase: Phase;
    notes: string;
    partIds: string[];
    steps: TaskStep[];
    done: boolean;
};

export type TossInput = {
    reason?: string;
    tossedOn?: string | null;
};

/** Parts-list filter keys: status, tag (incl. "Phase n" and "Other cars") or fits value. */
export type FilterKey = `st:${string}` | `tag:${string}` | `fits:${string}`;

/** Second argument to a form's onSaved: keepOpen is set after photo edits inside an open form. */
export interface SavedOptions {
    keepOpen?: boolean;
}
export type OnSaved<T> = (record: T, opts?: SavedOptions) => void;

// ---- UI callbacks shared by list and detail views ----

export interface PartActionHandlers {
    onEdit: (part: Part) => void;
    onToggleSale: (part: Part) => void;
    onToss: (part: Part) => void;
    onDelete: (part: Part) => void;
}

export interface ContainerActionHandlers {
    onEdit: (container: Container) => void;
    onDelete: (container: Container) => void;
}

export interface TaskActionHandlers {
    onToggle: (task: Task, done: boolean) => void;
    /** Check or uncheck one step; the task's done follows its steps. */
    onStep: (task: Task, index: number, done: boolean) => void;
    onEdit: (task: Task) => void;
    onDelete: (task: Task) => void;
}
