// Domain types: database rows, API response shapes, and validated request inputs.
// Their OpenAPI schemas are in schemas.ts (tsc would drop @openapi comments placed here).

export type PartStatus = 'Verified' | 'Unverified' | 'Unknown';
export type Phase = 1 | 2 | 3 | 4;
export type ContainerIcon = 'trim' | 'engine' | 'electrical' | 'other' | 'askcody' | 'none' | 'hardware' | 'box';

/** Tables that own photos. */
export type PhotoTable = 'parts' | 'containers' | 'tossed';
/** Tables whose records can be looked up by UUID or key. */
export type KeyedTable = PhotoTable | 'notes';

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
    /** The uploaded file's name; for catalog photos, "<catalog id>.jpg". */
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
    title: string;
    phase: Phase;
    done: boolean;
}

export interface PartRow {
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

export interface Part {
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

export interface ContainerRow {
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

export interface Container {
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

export interface TossedRow {
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

export interface Tossed {
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

export interface TaskRow {
    id: string;
    title: string;
    phase: Phase;
    notes: string;
    done: boolean;
    done_at: Date | null;
    created_at: Date;
    updated_at: Date;
    parts: TaskPartRef[];
}

export interface Task {
    id: string;
    title: string;
    phase: Phase;
    notes: string;
    done: boolean;
    doneAt: Date | null;
    parts: TaskPartRef[];
    createdAt: Date;
    updatedAt: Date;
}

// ---- notes ----

export interface NoteRow {
    id: string;
    key: string | null;
    title: string;
    items: string[];
    created_at: Date;
    updated_at: Date;
}

export interface Note {
    id: string;
    key: string | null;
    title: string;
    items: string[];
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
    title?: string;
    phase?: Phase;
    notes?: string;
    done?: boolean;
    partIds?: string[];
}

export interface NoteInput {
    key?: string | null;
    title?: string;
    items?: string[];
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
    title: string;
    phase?: number;
    notes?: string;
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
