// Parts list: a filter menu (status, tags incl. task phases, fits), then cards or a compact table.
// Clicking a card or row opens the part's own page.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Gallery, { Thumb } from './Gallery';
import { Icon } from './Icons';
import { StatusBadge, FitsPill, TagPills, BoxLink, RowActions, AddButton } from './ui';
import {
    STATUSES,
    OTHER_CARS,
    FOR_SALE,
    PRIORITY_TAGS,
    isOtherCar,
    isForSale,
    allTags,
    valueRange,
    sumLow,
    sumHigh,
    href,
    isWithin,
} from '../constants';
import type { FilterKey, Part, PartActionHandlers } from '../types';

export type Layout = 'cards' | 'table';
type SetFilters = (filters: Set<FilterKey>) => void;

export function matches(p: Part, filters: Set<FilterKey>): boolean {
    const pick = (pre: 'st:' | 'tag:' | 'fits:'): string[] =>
        [...filters].filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length));
    const st = pick('st:');
    const tg = pick('tag:');
    const fi = pick('fits:');
    if (st.length && !st.includes(p.status)) return false;
    if (fi.length && !fi.includes(p.fits)) return false;
    if (tg.length && !tg.some((t) => (t === OTHER_CARS ? isOtherCar(p.fits) : allTags(p).includes(t)))) return false;
    return true;
}
export const filterLabel = (k: FilterKey): string => k.replace(/^(st|tag):/, '').replace(/^fits:/, 'Fits ');

interface FilterMenuProps {
    parts: Part[];
    filters: Set<FilterKey>;
    setFilters: SetFilters;
}

function FilterMenu({ parts, filters, setFilters }: FilterMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState<boolean>(false);
    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e: globalThis.MouseEvent) => {
            if (!(e.target instanceof Node && ref.current?.contains(e.target))) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const count = (fn: (p: Part) => string[]): Record<string, number> => {
        const c: Record<string, number> = {};
        parts.forEach((p) =>
            fn(p).forEach((t) => {
                c[t] = (c[t] || 0) + 1;
            }),
        );
        return c;
    };
    const tagCounts = useMemo(() => count(allTags), [parts]);
    const fitsCounts = useMemo(() => count((p) => (p.fits ? [p.fits] : [])), [parts]);
    const tags = Object.keys(tagCounts).sort(
        (a, b) => (PRIORITY_TAGS.indexOf(a) + 1 || 99) - (PRIORITY_TAGS.indexOf(b) + 1 || 99) || a.localeCompare(b),
    );
    const fits = Object.keys(fitsCounts).sort((a, b) => (a === 'RSX' ? -1 : b === 'RSX' ? 1 : a.localeCompare(b)));
    const toggle = (k: FilterKey) => {
        const next = new Set(filters);
        next.has(k) ? next.delete(k) : next.add(k);
        setFilters(next);
    };
    const Opt = ({ k, label, n }: { k: FilterKey; label: string; n: number }) => (
        <label>
            <input type="checkbox" checked={filters.has(k)} onChange={() => toggle(k)} />
            {label}
            <span className="n">{n}</span>
        </label>
    );

    return (
        <div className="fdd" ref={ref}>
            <button
                type="button"
                className="chip fsum"
                title="Filter"
                aria-label={filters.size ? `Filter, ${filters.size} active` : 'Filter'}
                aria-expanded={open}
                aria-pressed={filters.size > 0}
                onClick={() => setOpen(!open)}
            >
                <Icon.filter />
                <span className="fcount">{filters.size || ''}</span>
            </button>
            {open && (
                <div className="fpanel">
                    <h4>Status</h4>
                    {STATUSES.map((s) => (
                        <Opt key={s} k={`st:${s}`} label={s} n={parts.filter((p) => p.status === s).length} />
                    ))}
                    <h4>Tags</h4>
                    <Opt
                        k={`tag:${OTHER_CARS}`}
                        label={OTHER_CARS}
                        n={parts.filter((p) => isOtherCar(p.fits)).length}
                    />
                    {tags.map((t) => (
                        <Opt key={t} k={`tag:${t}`} label={t} n={tagCounts[t]} />
                    ))}
                    <h4>Fits</h4>
                    {fits.map((f) => (
                        <Opt key={f} k={`fits:${f}`} label={f} n={fitsCounts[f]} />
                    ))}
                    {filters.size > 0 && (
                        <button
                            type="button"
                            className="ibtn clr"
                            title="Clear filters"
                            aria-label="Clear filters"
                            onClick={() => setFilters(new Set())}
                        >
                            <Icon.x />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/** Edit / sale / toss / delete icons for a part. */
interface PartActionsProps extends PartActionHandlers {
    part: Part;
    inTable?: boolean;
    className?: string;
}

export function PartActions({ part, inTable, className, onEdit, onToggleSale, onToss, onDelete }: PartActionsProps) {
    return (
        <RowActions
            inTable={inTable}
            className={className}
            onEdit={() => onEdit(part)}
            extra={[
                isForSale(part)
                    ? {
                          label: 'Take off sale',
                          icon: <Icon.untagSale />,
                          cls: 'move',
                          onClick: () => onToggleSale(part),
                      }
                    : {
                          label: 'Mark for sale',
                          icon: <Icon.tagSale />,
                          cls: 'move',
                          onClick: () => onToggleSale(part),
                      },
                { label: 'Toss (move to Tossed)', icon: <Icon.toss />, cls: 'toss', onClick: () => onToss(part) },
            ]}
            onDelete={() => onDelete(part)}
            deleteLabel="Delete"
            confirmText="Delete for good?"
        />
    );
}

interface PartsViewProps extends PartActionHandlers {
    parts: Part[];
    layout: Layout;
    canEdit: boolean;
    filters: Set<FilterKey>;
    setFilters: SetFilters;
    onAdd: () => void;
}

export default function PartsView({ parts, layout, canEdit, filters, setFilters, onAdd, ...acts }: PartsViewProps) {
    const list = parts.filter((p) => matches(p, filters));
    const open = (p: Part) => {
        window.location.hash = href.part(p);
    };
    const onRowClick = (p: Part) => (e: MouseEvent<HTMLElement>) => {
        if (!isWithin(e.target, 'a,button,input')) open(p);
    };

    let body;
    if (!parts.length) body = <div className="empty">No parts yet. Add parts with a photo and a name.</div>;
    else if (!list.length) body = <div className="empty">No parts match this filter.</div>;
    else if (layout === 'table') {
        body = (
            <div className="tblwrap">
                <table className="tbl">
                    <thead>
                        <tr>
                            <th>Photo</th>
                            <th>Part</th>
                            <th>Status</th>
                            <th className="num">Value</th>
                            {canEdit && (
                                <th>
                                    <span className="sr">Actions</span>
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((p) => (
                            <tr key={p.id} className="prow" onClick={onRowClick(p)}>
                                <td className="phc">
                                    <Thumb photos={p.photos} label={p.label} />
                                    <BoxLink container={p.container} />
                                </td>
                                <td className="lbl">
                                    <div>
                                        <a className="plink" href={href.part(p)}>
                                            {p.label}
                                        </a>
                                    </div>
                                    {p.partNumber && <div className="pn">{p.partNumber}</div>}
                                    {p.fits || p.tags?.length || p.phaseTags?.length ? (
                                        <div className="fitsline">
                                            <FitsPill fits={p.fits} />
                                            <TagPills part={p} />
                                        </div>
                                    ) : null}
                                </td>
                                <td>
                                    <StatusBadge part={p} iconOnly />
                                </td>
                                <td className="num">{valueRange(p.valueLow, p.valueHigh)}</td>
                                {canEdit && (
                                    <td>
                                        <PartActions part={p} inTable {...acts} />
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={3}>
                                {list.length} {list.length === 1 ? 'item' : 'items'}
                                {list.length !== parts.length && <span className="of"> of {parts.length}</span>}
                            </td>
                            <td className="num">{valueRange(sumLow(list), sumHigh(list))}</td>
                            {canEdit && <td />}
                        </tr>
                    </tfoot>
                </table>
            </div>
        );
    } else {
        body = (
            <div className="grid">
                {list.map((p) => (
                    <article className="card pcard" key={p.id} onClick={onRowClick(p)}>
                        <Gallery photos={p.photos} label={p.label} />
                        <div className="tag">
                            <h2>
                                <a className="plink" href={href.part(p)}>
                                    {p.label}
                                </a>
                            </h2>
                            {p.partNumber && <div className="pn">{p.partNumber}</div>}
                            {p.container && (
                                <div className="boxln">
                                    <BoxLink container={p.container} />
                                </div>
                            )}
                        </div>
                        <div className="body">
                            <div className="meta">
                                <StatusBadge part={p} />
                                <FitsPill fits={p.fits} />
                                <TagPills part={p} />
                            </div>
                        </div>
                        {canEdit && <PartActions part={p} {...acts} />}
                    </article>
                ))}
            </div>
        );
    }

    return (
        <section className="view" style={{ display: 'grid', gap: 20 }}>
            <div className="bar">
                <FilterMenu parts={parts} filters={filters} setFilters={setFilters} />
                <div className="factive">
                    {[...filters].map((k) => (
                        <button
                            key={k}
                            className="chip"
                            aria-pressed="true"
                            title="Remove filter"
                            onClick={() => {
                                const n = new Set(filters);
                                n.delete(k);
                                setFilters(n);
                            }}
                        >
                            {filterLabel(k)} ×
                        </button>
                    ))}
                </div>
                <span className="spacer" />
                {canEdit && <AddButton label="Add part" onClick={onAdd} />}
            </div>
            {body}
        </section>
    );
}

export { FOR_SALE };
