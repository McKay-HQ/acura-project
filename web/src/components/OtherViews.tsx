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
    const assigned = parts.filter((part) => part.container).length;
    const open = (box: Container) => (event: MouseEvent<HTMLElement>) => {
        if (!isWithin(event.target, 'a,button')) window.location.hash = href.box(box);
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
                    {tops.map((box) => {
                        const inside = partsInTree(parts, containers, box.id);
                        const subs = subContainers(containers, box.id);
                        return (
                            <article className="card bcard" key={box.id} onClick={open(box)}>
                                <Gallery photos={box.photos} label={box.name} />
                                <div className="tag">
                                    <h2>
                                        <a className="plink" href={href.box(box)}>
                                            <BoxIcon icon={box.icon} />
                                            {box.name}
                                        </a>
                                    </h2>
                                    {box.location && <div className="pn">{box.location}</div>}
                                </div>
                                <div className="body">
                                    <div className="bcount">
                                        {inside.length} {inside.length === 1 ? 'part' : 'parts'}
                                        {subs.length > 0 && (
                                            <span className="subnames">
                                                {' '}
                                                · {subs.map((sub) => sub.name).join(', ')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {canEdit && (
                                    <RowActions
                                        onEdit={() => onEdit(box)}
                                        onDelete={() => onDelete(box)}
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
                    {tossed.map((item) => (
                        <article className="card tossed" key={item.id}>
                            <Gallery photos={item.photos} label={item.label} />
                            <div className="tag">
                                <h2>{item.label}</h2>
                                {item.partNumber && <div className="pn">{item.partNumber}</div>}
                            </div>
                            <div className="body">
                                {item.tossedOn && (
                                    <div className="meta">
                                        <span className="pill tdate">Tossed {fmtDate(item.tossedOn)}</span>
                                    </div>
                                )}
                                {item.reason && <p className="notes">{item.reason}</p>}
                            </div>
                            {canEdit && (
                                <RowActions
                                    onEdit={() => onEdit(item)}
                                    onDelete={() => onDelete(item)}
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
