// Parts list: a filter menu (status, tags incl. task phases, fits), then cards or a compact table.
// Clicking a card or row opens the part's own page.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Gallery, { Thumb } from './Gallery';
import { Icon } from './Icons';
import { StatusBadge, FitsPill, TagPills, BoxLink, RowActions, AddButton, NavTools } from './ui';
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

export function matches(part: Part, filters: Set<FilterKey>): boolean {
    const pick = (pre: 'st:' | 'tag:' | 'fits:'): string[] =>
        [...filters].filter((key) => key.startsWith(pre)).map((key) => key.slice(pre.length));
    const st = pick('st:');
    const tg = pick('tag:');
    const fi = pick('fits:');
    if (st.length && !st.includes(part.status)) return false;
    if (fi.length && !fi.includes(part.fits)) return false;
    if (tg.length && !tg.some((tag) => (tag === OTHER_CARS ? isOtherCar(part.fits) : allTags(part).includes(tag))))
        return false;
    return true;
}
export const filterLabel = (key: FilterKey): string => key.replace(/^(st|tag):/, '').replace(/^fits:/, 'Fits ');

interface FilterMenuProps {
    parts: Part[];
    filters: Set<FilterKey>;
    setFilters: SetFilters;
}

/** How many parts have each value that `fn` lists for a part. */
function countBy(parts: Part[], fn: (part: Part) => string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    parts.forEach((part) =>
        fn(part).forEach((tag) => {
            counts[tag] = (counts[tag] || 0) + 1;
        }),
    );
    return counts;
}

function FilterMenu({ parts, filters, setFilters }: FilterMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState<boolean>(false);
    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (event: globalThis.MouseEvent) => {
            if (!(event.target instanceof Node && ref.current?.contains(event.target))) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const tagCounts = useMemo(() => countBy(parts, allTags), [parts]);
    const fitsCounts = useMemo(() => countBy(parts, (part) => (part.fits ? [part.fits] : [])), [parts]);
    const tags = Object.keys(tagCounts).sort(
        (left, right) =>
            (PRIORITY_TAGS.indexOf(left) + 1 || 99) - (PRIORITY_TAGS.indexOf(right) + 1 || 99) ||
            left.localeCompare(right),
    );
    const fits = Object.keys(fitsCounts).sort((left, right) =>
        left === 'RSX' ? -1 : right === 'RSX' ? 1 : left.localeCompare(right),
    );
    const toggle = (key: FilterKey) => {
        const next = new Set(filters);
        if (next.has(key)) next.delete(key);
        else next.add(key);
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
                    {STATUSES.map((status) => (
                        <Opt
                            key={status}
                            k={`st:${status}`}
                            label={status}
                            n={parts.filter((part) => part.status === status).length}
                        />
                    ))}
                    <h4>Tags</h4>
                    <Opt
                        k={`tag:${OTHER_CARS}`}
                        label={OTHER_CARS}
                        n={parts.filter((part) => isOtherCar(part.fits)).length}
                    />
                    {tags.map((tag) => (
                        <Opt key={tag} k={`tag:${tag}`} label={tag} n={tagCounts[tag]} />
                    ))}
                    <h4>Fits</h4>
                    {fits.map((fit) => (
                        <Opt key={fit} k={`fits:${fit}`} label={fit} n={fitsCounts[fit]} />
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
    const list = parts.filter((part) => matches(part, filters));
    const open = (part: Part) => {
        window.location.hash = href.part(part);
    };
    const onRowClick = (part: Part) => (event: MouseEvent<HTMLElement>) => {
        if (!isWithin(event.target, 'a,button,input')) open(part);
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
                        {list.map((part) => (
                            <tr key={part.id} className="prow" onClick={onRowClick(part)}>
                                <td className="phc">
                                    <Thumb photos={part.photos} label={part.label} />
                                    <BoxLink container={part.container} />
                                </td>
                                <td className="lbl">
                                    <div>
                                        <a className="plink" href={href.part(part)}>
                                            {part.label}
                                        </a>
                                    </div>
                                    {part.partNumber && <div className="pn">{part.partNumber}</div>}
                                    {part.fits || part.tags?.length || part.phaseTags?.length ? (
                                        <div className="fitsline">
                                            <FitsPill fits={part.fits} />
                                            <TagPills part={part} />
                                        </div>
                                    ) : null}
                                </td>
                                <td>
                                    <StatusBadge part={part} iconOnly />
                                </td>
                                <td className="num">{valueRange(part.valueLow, part.valueHigh)}</td>
                                {canEdit && (
                                    <td>
                                        <PartActions part={part} inTable {...acts} />
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
                {list.map((part) => (
                    <article className="card pcard" key={part.id} onClick={onRowClick(part)}>
                        <Gallery photos={part.photos} label={part.label} />
                        <div className="tag">
                            <h2>
                                <a className="plink" href={href.part(part)}>
                                    {part.label}
                                </a>
                            </h2>
                            {part.partNumber && <div className="pn">{part.partNumber}</div>}
                            {part.container && (
                                <div className="boxln">
                                    <BoxLink container={part.container} />
                                </div>
                            )}
                        </div>
                        <div className="body">
                            <div className="meta">
                                <StatusBadge part={part} />
                                <FitsPill fits={part.fits} />
                                <TagPills part={part} />
                            </div>
                        </div>
                        {canEdit && <PartActions part={part} {...acts} />}
                    </article>
                ))}
            </div>
        );
    }

    return (
        <section className="view" style={{ display: 'grid', gap: '1.25rem' }}>
            <div className="bar">
                <NavTools>
                    <FilterMenu parts={parts} filters={filters} setFilters={setFilters} />
                </NavTools>
                <div className="factive">
                    {[...filters].map((key) => (
                        <button
                            key={key}
                            className="chip"
                            aria-pressed="true"
                            title="Remove filter"
                            onClick={() => {
                                const next = new Set(filters);
                                next.delete(key);
                                setFilters(next);
                            }}
                        >
                            {filterLabel(key)} ×
                        </button>
                    ))}
                </div>
                <span className="spacer" />
                {canEdit && (
                    <NavTools>
                        <AddButton label="Add part" onClick={onAdd} />
                    </NavTools>
                )}
            </div>
            {body}
        </section>
    );
}

export { FOR_SALE };
