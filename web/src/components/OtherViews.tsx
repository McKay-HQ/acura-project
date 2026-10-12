// Containers (top-level only; click one for its page) and Tossed.
import Gallery from './Gallery';
import { BoxIcon } from './Icons';
import { RowActions, AddButton } from './ui';
import { fmtDate, href, topContainers, subContainers, partsInTree, isWithin } from '../constants';
import type { MouseEvent } from 'react';
import type { Container, ContainerActionHandlers, Part, Tossed } from '../types';

interface ContainersViewProps extends ContainerActionHandlers {
    containers: Container[];
    parts: Part[];
    canEdit: boolean;
    onAdd: () => void;
}

export function ContainersView({ containers, parts, canEdit, onAdd, onEdit, onDelete }: ContainersViewProps) {
    const tops = topContainers(containers);
    const assigned = parts.filter((p) => p.container).length;
    const open = (b: Container) => (e: MouseEvent<HTMLElement>) => {
        if (!isWithin(e.target, 'a,button')) window.location.hash = href.box(b);
    };
    return (
        <section className="view" style={{ display: 'grid', gap: 20 }}>
            <div className="bar">
                {tops.length > 0 && (
                    <span className="mini">
                        {tops.length} {tops.length === 1 ? 'container' : 'containers'} · {assigned} parts assigned
                    </span>
                )}
                <span className="spacer" />
                {canEdit && <AddButton label="Add container" onClick={onAdd} />}
            </div>
            {!tops.length ? (
                <div className="empty">No containers yet. Add each box or bin with a photo.</div>
            ) : (
                <div className="grid">
                    {tops.map((b) => {
                        const inside = partsInTree(parts, containers, b.id);
                        const subs = subContainers(containers, b.id);
                        return (
                            <article className="card bcard" key={b.id} onClick={open(b)}>
                                <Gallery photos={b.photos} label={b.name} />
                                <div className="tag">
                                    <h2>
                                        <a className="plink" href={href.box(b)}>
                                            <BoxIcon icon={b.icon} />
                                            {b.name}
                                        </a>
                                    </h2>
                                    {b.location && <div className="pn">{b.location}</div>}
                                </div>
                                <div className="body">
                                    <div className="bcount">
                                        {inside.length} {inside.length === 1 ? 'part' : 'parts'}
                                        {subs.length > 0 && (
                                            <span className="subnames"> · {subs.map((s) => s.name).join(', ')}</span>
                                        )}
                                    </div>
                                </div>
                                {canEdit && (
                                    <RowActions
                                        onEdit={() => onEdit(b)}
                                        onDelete={() => onDelete(b)}
                                        confirmText="Remove? Its parts stay."
                                    />
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

interface TossedViewProps {
    tossed: Tossed[];
    canEdit: boolean;
    onAdd: () => void;
    onEdit: (item: Tossed) => void;
    onDelete: (item: Tossed) => void;
}

export function TossedView({ tossed, canEdit, onAdd, onEdit, onDelete }: TossedViewProps) {
    return (
        <section className="view" style={{ display: 'grid', gap: 20 }}>
            <div className="bar">
                <span className="mini">
                    Parts sorted out of the pile and thrown away, kept here for reference in case something turns up
                    missing.
                </span>
                <span className="spacer" />
                {canEdit && <AddButton label="Log tossed item" onClick={onAdd} />}
            </div>
            {!tossed.length ? (
                <div className="empty">Nothing tossed yet.</div>
            ) : (
                <div className="grid">
                    {tossed.map((x) => (
                        <article className="card tossed" key={x.id}>
                            <Gallery photos={x.photos} label={x.label} />
                            <div className="tag">
                                <h2>{x.label}</h2>
                                {x.partNumber && <div className="pn">{x.partNumber}</div>}
                            </div>
                            <div className="body">
                                {x.tossedOn && (
                                    <div className="meta">
                                        <span className="pill tdate">Tossed {fmtDate(x.tossedOn)}</span>
                                    </div>
                                )}
                                {x.reason && <p className="notes">{x.reason}</p>}
                            </div>
                            {canEdit && (
                                <RowActions
                                    onEdit={() => onEdit(x)}
                                    onDelete={() => onDelete(x)}
                                    deleteLabel="Delete record"
                                    confirmText="Delete record?"
                                />
                            )}
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
