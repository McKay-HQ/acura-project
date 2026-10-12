// Detail pages for a part, a top-level container (parts grouped by sub-container) and a task.
import Gallery, { Thumb } from './Gallery';
import { BoxIcon } from './Icons';
import { StatusBadge, StatusIcon, FitsPill, TagPills, BoxLink, RowActions, BackLink } from './ui';
import { PartActions } from './PartsView';
import {
    PHASES,
    isForSale,
    valueRange,
    sumLow,
    sumHigh,
    fmtDate,
    href,
    subContainers,
    partsInTree,
    phaseClass,
} from '../constants';
import type { Container, ContainerActionHandlers, Part, PartActionHandlers, Task, TaskActionHandlers } from '../types';
import type { ReactNode } from 'react';

function PartRows({ parts }: { parts: Part[] }) {
    if (!parts.length) return <div className="empty sm">Nothing here yet.</div>;
    return (
        <div className="blist">
            {[...parts]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((p) => (
                    <a className="bitem" key={p.id} href={href.part(p)}>
                        <Thumb photos={p.photos} label={p.label} />
                        <span className="bi-t">
                            <b>{p.label}</b>
                            {p.partNumber && <span className="pn">{p.partNumber}</span>}
                        </span>
                        <StatusIcon part={p} />
                    </a>
                ))}
        </div>
    );
}

interface MissingProps {
    back: ReactNode;
    label: string;
    what: string;
    loaded: boolean;
}

const Missing = ({ back, label, what, loaded }: MissingProps) => (
    <section className="detailpage">
        {back}
        <div className="empty">{loaded ? `This ${what} is no longer in the catalog.` : `Loading the ${label}…`}</div>
    </section>
);

interface PartDetailProps extends PartActionHandlers {
    part: Part | undefined;
    loaded: boolean;
    canEdit: boolean;
}

export function PartDetail({ part, loaded, canEdit, ...acts }: PartDetailProps) {
    const back = <BackLink to="#parts" label="All parts" />;
    if (!part) return <Missing back={back} what="part" label="part" loaded={loaded} />;
    const ownTags = (part.tags || []).filter((t) => t !== 'For sale');
    return (
        <section className="detailpage">
            {back}
            <article className="detail">
                <div className="dphotos">
                    <Gallery photos={part.photos} label={part.label} />
                </div>
                <div className="dinfo">
                    <div className="tag">
                        <h2>{part.label}</h2>
                        {part.partNumber && <div className="pn">{part.partNumber}</div>}
                    </div>
                    <div className="price">{valueRange(part.valueLow, part.valueHigh)}</div>
                    <div className="meta">
                        <StatusBadge part={part} />
                        <FitsPill fits={part.fits} />
                    </div>
                    <dl className="specs">
                        <dt>Status</dt>
                        <dd>{isForSale(part) ? 'For sale' : part.status}</dd>
                        {part.fits && (
                            <>
                                <dt>Fits</dt>
                                <dd>{part.fits}</dd>
                            </>
                        )}
                        {part.container && (
                            <>
                                <dt>Container</dt>
                                <dd>
                                    <BoxLink container={part.container} />
                                </dd>
                            </>
                        )}
                        {(ownTags.length > 0 || part.phaseTags?.length > 0) && (
                            <>
                                <dt>Tags</dt>
                                <dd>
                                    <TagPills part={part} />
                                </dd>
                            </>
                        )}
                        {part.tasks?.length > 0 && (
                            <>
                                <dt>Tasks</dt>
                                <dd>
                                    {part.tasks.map((t, i) => (
                                        <span key={t.id}>
                                            {i > 0 && ', '}
                                            <a className="plink" href={href.task(t)}>
                                                {t.title}
                                            </a>
                                        </span>
                                    ))}
                                </dd>
                            </>
                        )}
                        <dt>Added</dt>
                        <dd>{fmtDate(part.createdAt)}</dd>
                    </dl>
                    {part.notes && (
                        <div>
                            <h3>Notes</h3>
                            <p className="notes">{part.notes}</p>
                        </div>
                    )}
                    {canEdit && <PartActions part={part} {...acts} />}
                </div>
            </article>
        </section>
    );
}

interface ContainerDetailProps extends ContainerActionHandlers {
    box: Container | undefined;
    boxes: Container[];
    parts: Part[];
    loaded: boolean;
    canEdit: boolean;
}

export function ContainerDetail({ box, boxes, parts, loaded, canEdit, onEdit, onDelete }: ContainerDetailProps) {
    const back = <BackLink to="#containers" label="All containers" />;
    if (!box) return <Missing back={back} what="container" label="container" loaded={loaded} />;
    const subs = subContainers(boxes, box.id);
    const all = partsInTree(parts, boxes, box.id);
    const loose = parts.filter((p) => p.container?.id === box.id);
    return (
        <section className="detailpage">
            {back}
            <article className="detail">
                <div className="dphotos">
                    <Gallery photos={box.photos} label={box.name} />
                </div>
                <div className="dinfo">
                    <div className="tag">
                        <h2>
                            <BoxIcon icon={box.icon} />
                            {box.name}
                        </h2>
                        {box.location && <div className="pn">{box.location}</div>}
                    </div>
                    <div className="price">
                        {all.length} {all.length === 1 ? 'part' : 'parts'}{' '}
                        <span className="sub2">· {valueRange(sumLow(all), sumHigh(all))}</span>
                    </div>
                    {subs.length > 0 && <div className="subnames">{subs.map((s) => s.name).join(' · ')}</div>}
                    {box.notes && (
                        <div>
                            <h3>Notes</h3>
                            <p className="notes">{box.notes}</p>
                        </div>
                    )}
                    {canEdit && (
                        <RowActions
                            onEdit={() => onEdit(box)}
                            onDelete={() => onDelete(box)}
                            confirmText="Remove this container? Its parts stay in the catalog."
                        />
                    )}
                </div>
            </article>
            <section className="bparts">
                <h3>Parts in this container</h3>
                {subs.length ? (
                    <>
                        {subs.map((s) => {
                            const inSub = parts.filter((p) => p.container?.id === s.id);
                            return (
                                <div className="bgroup" key={s.id}>
                                    <h4>
                                        {s.name} <span className="gn">{inSub.length}</span>
                                        {canEdit && (
                                            <RowActions
                                                className="gtools"
                                                onEdit={() => onEdit(s)}
                                                onDelete={() => onDelete(s)}
                                                deleteLabel={`Remove ${s.name}`}
                                                confirmText={`Remove “${s.name}”? Its parts move to ${box.name}.`}
                                            />
                                        )}
                                    </h4>
                                    <PartRows parts={inSub} />
                                </div>
                            );
                        })}
                        {loose.length > 0 && (
                            <div className="bgroup">
                                <h4>
                                    Not in a sub-container <span className="gn">{loose.length}</span>
                                </h4>
                                <PartRows parts={loose} />
                            </div>
                        )}
                    </>
                ) : (
                    <PartRows parts={all} />
                )}
            </section>
        </section>
    );
}

interface TaskDetailProps extends TaskActionHandlers {
    task: Task | undefined;
    parts: Part[];
    loaded: boolean;
    canEdit: boolean;
}

export function TaskDetail({ task, parts, loaded, canEdit, onToggle, onEdit, onDelete }: TaskDetailProps) {
    const back = <BackLink to="#tasks" label="All tasks" />;
    if (!task) return <Missing back={back} what="task" label="task" loaded={loaded} />;
    const linked = (task.parts || []).map((x) => parts.find((p) => p.id === x.id)).filter((p): p is Part => Boolean(p));
    return (
        <section className="detailpage">
            {back}
            <article className="detail tdetail">
                <div className="dinfo">
                    <div className="tag">
                        <h2>{task.title}</h2>
                        <div className="pn">
                            Phase {task.phase}: {PHASES[task.phase]}
                        </div>
                    </div>
                    <span className={`pill ${phaseClass(task.phase)}`} style={{ justifySelf: 'start' }}>
                        Phase {task.phase}
                    </span>
                    <label className="tdone">
                        <input
                            type="checkbox"
                            checked={task.done}
                            disabled={!canEdit}
                            onChange={(e) => onToggle(task, e.target.checked)}
                        />{' '}
                        Done
                    </label>
                    {task.notes && (
                        <div>
                            <h3>Description</h3>
                            <p className="notes">{task.notes}</p>
                        </div>
                    )}
                    {canEdit && (
                        <RowActions
                            onEdit={() => onEdit(task)}
                            onDelete={() => onDelete(task)}
                            deleteLabel="Delete task"
                            confirmText="Delete this task?"
                        />
                    )}
                </div>
            </article>
            <section className="bparts">
                <h3>Parts for this task</h3>
                {linked.length ? (
                    <PartRows parts={linked} />
                ) : (
                    <div className="empty sm">No parts linked to this task.</div>
                )}
            </section>
        </section>
    );
}
