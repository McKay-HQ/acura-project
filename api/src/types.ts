// Domain types: database rows, API response shapes, and validated request inputs.
// Their OpenAPI schemas are in schemas.ts (tsc would drop @openapi comments placed here).

export type PartStatus = 'Verified' | 'Unverified' | 'Unknown';
export type Phase = 1 | 2 | 3 | 4;
export type ContainerIcon = 'trim' | 'engine' | 'electrical' | 'other' | 'askcody' | 'none' | 'hardware' | 'box';

/** Tables that own photos. */
export type PhotoTable = 'parts' | 'containers' | 'tossed';
/** Tables whose records can be looked up by UUID or key; all are versioned and soft-deleted. */
export type KeyedTable = PhotoTable | 'notes' | 'tasks' | 'expenses';

/** Columns every record row has: version (bumped by triggers, for If-Match) and the soft-delete time. */
export interface SyncRow {
    version: number;
    deleted_at: Date | null;
}

/** Fields every record in an API response has: its version (for If-Match) and when it was deleted. */
export interface Versioned {
    version: number;
    deletedAt: Date | null;
}

// ---- photos ----

/** One element of the JSON array built by photosJson() in services/common. */
export interface PhotoJson {
    id: string;
    filename: string;
    thumb: string;
    width: number | null;
    height: number | null;
    source: string | null;
}

/** Filenames of a photo on disk, as stored in the photos table. */
export interface PhotoFileRow {
    filename: string;
    thumb_filename: string;
}

export interface Photo {
    id: string;
    url: string;
    thumbUrl: string;
    width: number | null;
    height: number | null;
    /** The uploaded file's name; for starter-data photos, "<32 hex digits>.jpg". */
    source: string | null;
}

export interface ProcessedPhoto {
    filename: string;
    thumbFilename: string;
    width: number;
    height: number;
}

// ---- parts ----

export interface PartTaskRef {
    id: string;
    key: string | null;
    title: string;
    phase: Phase;
    done: boolean;
}

export interface PartRow extends SyncRow {
    id: string;
    key: string | null;
    label: string;
    part_number: string;
    fits: string;
    status: PartStatus;
    tags: string[];
    value_low: number | null;
    value_high: number | null;
    notes: string;
    container_id: string | null;
    created_at: Date;
    updated_at: Date;
    container_name: string | null;
    container_key: string | null;
    container_parent_id: string | null;
    container_icon: ContainerIcon | null;
    parent_name: string | null;
    parent_key: string | null;
    parent_icon: ContainerIcon | null;
    tasks: PartTaskRef[];
    photos: PhotoJson[];
}

export interface ContainerRef {
    id: string;
    key: string | null;
    name: string | null;
    icon: ContainerIcon | null;
}

/** The container a part is in; `top` is its top-level parent (or itself when top-level). */
export interface PartContainer extends ContainerRef {
    top: ContainerRef;
}

export interface Part extends Versioned {
    id: string;
    key: string | null;
    label: string;
    partNumber: string;
    fits: string;
    status: PartStatus;
    tags: string[];
    valueLow: number | null;
    valueHigh: number | null;
    notes: string;
    container: PartContainer | null;
    tasks: PartTaskRef[];
    phaseTags: string[];
    photos: Photo[];
    createdAt: Date;
    updatedAt: Date;
}

/** Query-string filters for GET /parts; values come straight from the URL, so they are unvalidated. */
export interface PartFilters {
    status?: unknown;
    tag?: unknown;
    fits?: unknown;
    container?: unknown;
    q?: unknown;
}

export interface TagCount {
    tag: string;
    count: number;
}

// ---- containers ----

export interface ContainerPartRef {
    id: string;
    key: string | null;
    label: string;
    status: PartStatus;
}

export interface ContainerRow extends SyncRow {
    id: string;
    key: string | null;
    name: string;
    location: string;
    notes: string;
    parent_id: string | null;
    icon: ContainerIcon;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
    photos: PhotoJson[];
    parts: ContainerPartRef[];
}

export interface Container extends Versioned {
    id: string;
    key: string | null;
    name: string;
    location: string;
    notes: string;
    parentId: string | null;
    icon: ContainerIcon;
    sortOrder: number;
    photos: Photo[];
    parts: ContainerPartRef[];
    partCount: number;
    createdAt: Date;
    updatedAt: Date;
}

// ---- tossed ----

export interface TossedRow extends SyncRow {
    id: string;
    key: string | null;
    label: string;
    part_number: string;
    reason: string;
    /** DATE column, returned as 'YYYY-MM-DD' (see db.ts). */
    tossed_on: string | null;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
    photos: PhotoJson[];
}

export interface Tossed extends Versioned {
    id: string;
    key: string | null;
    label: string;
    partNumber: string;
    reason: string;
    tossedOn: string | null;
    photos: Photo[];
    createdAt: Date;
    updatedAt: Date;
}

// ---- tasks ----

export interface TaskPartRef {
    id: string;
    key: string | null;
    label: string;
    partNumber: string;
    status: PartStatus;
}

/** A link from a task step: a page in the app (/part/..., /task/...) or an https URL. */
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

export interface TaskRow extends SyncRow {
    id: string;
    key: string | null;
    title: string;
    phase: Phase;
    notes: string;
    steps: TaskStep[];
    done: boolean;
    done_at: Date | null;
    created_at: Date;
    updated_at: Date;
    parts: TaskPartRef[];
}

export interface Task extends Versioned {
    id: string;
    key: string | null;
    title: string;
    phase: Phase;
    notes: string;
    steps: TaskStep[];
    done: boolean;
    doneAt: Date | null;
    parts: TaskPartRef[];
    createdAt: Date;
    updatedAt: Date;
}

// ---- notes ----

export interface NoteRow extends SyncRow {
    id: string;
    key: string | null;
    title: string;
    items: string[];
    created_at: Date;
    updated_at: Date;
}

export interface Note extends Versioned {
    id: string;
    key: string | null;
    title: string;
    items: string[];
    createdAt: Date;
    updatedAt: Date;
}

// ---- expenses ----

export interface ExpenseRow extends SyncRow {
    id: string;
    key: string | null;
    label: string;
    vendor: string;
    price: number;
    paid: boolean;
    /** DATE column, returned as 'YYYY-MM-DD' (see db.ts). */
    paid_on: string | null;
    notes: string;
    created_at: Date;
    updated_at: Date;
}

export interface Expense extends Versioned {
    id: string;
    key: string | null;
    label: string;
    vendor: string;
    price: number;
    paid: boolean;
    paidOn: string | null;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

// ---- summary ----

export interface SummaryRow {
    parts: number;
    verified: number;
    unverified: number;
    unknown: number;
    value_low: number;
    value_high: number;
    for_sale: number;
    sale_low: number;
    sale_high: number;
    containers: number;
    tossed: number;
    tasks_open: number;
    tasks_total: number;
}

export interface Summary {
    parts: { total: number; verified: number; unverified: number; unknown: number };
    value: { low: number; high: number };
    forSale: { count: number; low: number; high: number };
    containers: number;
    tossed: number;
    tasks: { open: number; total: number };
}

// ---- validated inputs (only the fields that were provided) ----

export interface ValidateOptions {
    create?: boolean;
}

export interface PartInput {
    key?: string | null;
    label?: string;
    partNumber?: string;
    fits?: string;
    status?: PartStatus;
    tags?: string[];
    valueLow?: number | null;
    valueHigh?: number | null;
    notes?: string;
    containerId?: string | null;
}

export interface ContainerInput {
    key?: string | null;
    name?: string;
    location?: string;
    notes?: string;
    parentId?: string | null;
    icon?: ContainerIcon;
    sortOrder?: number;
}

export interface TossedInput {
    key?: string | null;
    label?: string;
    partNumber?: string;
    reason?: string;
    tossedOn?: string | null;
}

export interface TaskInput {
    key?: string | null;
    title?: string;
    phase?: Phase;
    notes?: string;
    steps?: TaskStep[];
    done?: boolean;
    partIds?: string[];
}

export interface NoteInput {
    key?: string | null;
    title?: string;
    items?: string[];
}

export interface ExpenseInput {
    key?: string | null;
    label?: string;
    vendor?: string;
    price?: number | null;
    paid?: boolean;
    paidOn?: string | null;
    notes?: string;
}

// ---- seed/seed.json ----

export interface SeedContainer {
    key?: string;
    name: string;
    location?: string;
    notes?: string;
    parent?: string;
    icon?: string;
    order?: number;
    createdAt?: string;
    photos?: string[];
}

export interface SeedPart {
    key?: string;
    label: string;
    partNumber?: string;
    fits?: string;
    status?: string;
    tags?: string[];
    valueLow?: number | null;
    valueHigh?: number | null;
    notes?: string;
    container?: string;
    createdAt?: string;
    photos?: string[];
}

export interface SeedTossed {
    key?: string;
    label: string;
    partNumber?: string;
    reason?: string;
    tossedOn?: string | null;
    sortOrder?: number;
    photos?: string[];
}

export interface SeedTask {
    key?: string;
    title: string;
    phase?: number;
    notes?: string;
    steps?: TaskStep[];
    done?: boolean;
    parts?: string[];
    createdAt?: string;
}

export interface SeedNote {
    key?: string;
    title: string;
    items?: string[];
    createdAt?: string;
}

export interface SeedFile {
    version?: number;
    containers?: SeedContainer[];
    parts?: SeedPart[];
    tossed?: SeedTossed[];
    tasks?: SeedTask[];
    notes?: SeedNote[];
}
