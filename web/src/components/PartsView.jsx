// Parts list: a filter menu (status, tags incl. task phases, fits), then cards or a compact table.
// Clicking a card or row opens the part's own page.
import { useEffect, useMemo, useRef, useState } from 'react';
import Gallery, { Thumb } from './Gallery.jsx';
import { Icon } from './Icons.jsx';
import { StatusBadge, FitsPill, TagPills, BoxLink, RowActions, AddButton } from './ui.jsx';
import {
  STATUSES, OTHER_CARS, FOR_SALE, PRIORITY_TAGS, isOtherCar, isForSale, allTags, valueRange, sumLow, sumHigh, href,
} from '../constants.js';

export function matches(p, filters) {
  const pick = (pre) => [...filters].filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length));
  const st = pick('st:'); const tg = pick('tag:'); const fi = pick('fits:');
  if (st.length && !st.includes(p.status)) return false;
  if (fi.length && !fi.includes(p.fits)) return false;
  if (tg.length && !tg.some((t) => (t === OTHER_CARS ? isOtherCar(p.fits) : allTags(p).includes(t)))) return false;
  return true;
}
export const filterLabel = (k) => k.replace(/^(st|tag):/, '').replace(/^fits:/, 'Fits ');

function FilterMenu({ parts, filters, setFilters }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const count = (fn) => { const c = {}; parts.forEach((p) => fn(p).forEach((t) => { c[t] = (c[t] || 0) + 1; })); return c; };
  const tagCounts = useMemo(() => count(allTags), [parts]);
  const fitsCounts = useMemo(() => count((p) => (p.fits ? [p.fits] : [])), [parts]);
  const tags = Object.keys(tagCounts).sort((a, b) =>
    ((PRIORITY_TAGS.indexOf(a) + 1 || 99) - (PRIORITY_TAGS.indexOf(b) + 1 || 99)) || a.localeCompare(b));
  const fits = Object.keys(fitsCounts).sort((a, b) => (a === 'RSX' ? -1 : b === 'RSX' ? 1 : a.localeCompare(b)));
  const toggle = (k) => {
    const next = new Set(filters);
    next.has(k) ? next.delete(k) : next.add(k);
    setFilters(next);
  };
  const Opt = ({ k, label, n }) => (
    <label><input type="checkbox" checked={filters.has(k)} onChange={() => toggle(k)} />{label}<span className="n">{n}</span></label>
  );

  return (
    <div className="fdd" ref={ref}>
      <button type="button" className="chip fsum" title="Filter" aria-label={filters.size ? `Filter, ${filters.size} active` : 'Filter'}
        aria-expanded={open} aria-pressed={filters.size > 0} onClick={() => setOpen(!open)}>
        <Icon.filter /><span className="fcount">{filters.size || ''}</span>
      </button>
      {open && (
        <div className="fpanel">
          <h4>Status</h4>
          {STATUSES.map((s) => <Opt key={s} k={`st:${s}`} label={s} n={parts.filter((p) => p.status === s).length} />)}
          <h4>Tags</h4>
          <Opt k={`tag:${OTHER_CARS}`} label={OTHER_CARS} n={parts.filter((p) => isOtherCar(p.fits)).length} />
          {tags.map((t) => <Opt key={t} k={`tag:${t}`} label={t} n={tagCounts[t]} />)}
          <h4>Fits</h4>
          {fits.map((f) => <Opt key={f} k={`fits:${f}`} label={f} n={fitsCounts[f]} />)}
          {filters.size > 0 && (
            <button type="button" className="ibtn clr" title="Clear filters" aria-label="Clear filters" onClick={() => setFilters(new Set())}><Icon.x /></button>
          )}
        </div>
      )}
    </div>
  );
}

/** Edit / sale / toss / delete icons for a part. */
export function PartActions({ part, inTable, className, onEdit, onToggleSale, onToss, onDelete }) {
  return (
    <RowActions
      inTable={inTable}
      className={className}
      onEdit={() => onEdit(part)}
      extra={[
        isForSale(part)
          ? { label: 'Take off sale', icon: <Icon.untagSale />, cls: 'move', onClick: () => onToggleSale(part) }
          : { label: 'Mark for sale', icon: <Icon.tagSale />, cls: 'move', onClick: () => onToggleSale(part) },
        { label: 'Toss (move to Tossed)', icon: <Icon.toss />, cls: 'toss', onClick: () => onToss(part) },
      ]}
      onDelete={() => onDelete(part)}
      deleteLabel="Delete"
      confirmText="Delete for good?"
    />
  );
}

export default function PartsView({ parts, layout, canEdit, filters, setFilters, onAdd, ...acts }) {
  const list = parts.filter((p) => matches(p, filters));
  const open = (p) => { window.location.hash = href.part(p); };
  const onRowClick = (p) => (e) => { if (!e.target.closest('a,button,input')) open(p); };

  let body;
  if (!parts.length) body = <div className="empty">No parts yet. Add parts with a photo and a name.</div>;
  else if (!list.length) body = <div className="empty">No parts match this filter.</div>;
  else if (layout === 'table') {
    body = (
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Photo</th><th>Part</th><th>Status</th><th className="num">Value</th>
              {canEdit && <th><span className="sr">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="prow" onClick={onRowClick(p)}>
                <td className="phc"><Thumb photos={p.photos} label={p.label} /><BoxLink container={p.container} /></td>
                <td className="lbl">
                  <div><a className="plink" href={href.part(p)}>{p.label}</a></div>
                  {p.partNumber && <div className="pn">{p.partNumber}</div>}
                  {(p.fits || p.tags?.length || p.phaseTags?.length) ? (
                    <div className="fitsline"><FitsPill fits={p.fits} /><TagPills part={p} /></div>
                  ) : null}
                </td>
                <td><StatusBadge part={p} iconOnly /></td>
                <td className="num">{valueRange(p.valueLow, p.valueHigh)}</td>
                {canEdit && <td><PartActions part={p} inTable {...acts} /></td>}
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
              <h2><a className="plink" href={href.part(p)}>{p.label}</a></h2>
              {p.partNumber && <div className="pn">{p.partNumber}</div>}
              {p.container && <div className="boxln"><BoxLink container={p.container} /></div>}
            </div>
            <div className="body">
              <div className="meta"><StatusBadge part={p} /><FitsPill fits={p.fits} /><TagPills part={p} /></div>
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
            <button key={k} className="chip" aria-pressed="true" title="Remove filter"
              onClick={() => { const n = new Set(filters); n.delete(k); setFilters(n); }}>
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
