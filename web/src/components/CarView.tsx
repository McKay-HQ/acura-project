import { useState } from 'react';
import { CAR_SECTIONS, CONDITION, CONDITION_DATE, CONDITION_TASKS, carPhotos, type CarPhoto } from '../car';
import { findRef, href } from '../constants';
import type { Task } from '../types';
import PhotoViewer from './PhotoViewer';

interface CarViewProps {
    tasks: Task[];
}

function ConditionList({ title, items, first }: { title: string; items: string[]; first?: boolean }) {
    return (
        <>
            <h4 className={first ? 'condh first' : 'condh'}>{title}</h4>
            <ul className="condlist">
                {items.map((x) => (
                    <li key={x}>{x}</li>
                ))}
            </ul>
        </>
    );
}

// The car itself: what the latest photos show, then the photos by area. On phones each area is a
// row to swipe; from 720px it's a grid of four thumbnails per row. Any photo opens the viewer.
export default function CarView({ tasks }: CarViewProps) {
    const [open, setOpen] = useState<{ photos: CarPhoto[]; index: number; label: string } | null>(null);
    const follow = CONDITION_TASKS.map((k) => findRef(tasks, k)).filter((t): t is Task => !!t);

    return (
        <section id="carView" style={{ display: 'grid', gap: 16 }}>
            <div className="panel">
                <h3>Condition</h3>
                <p className="fine">From the photos below, taken {CONDITION_DATE}.</p>
                <div className="homegrid">
                    <div>
                        <ConditionList title="Exterior" items={CONDITION.exterior} first />
                        <ConditionList title="Interior" items={CONDITION.interior} />
                    </div>
                    <div>
                        <ConditionList title="Engine bay" items={CONDITION.engine} first />
                    </div>
                </div>
                {follow.length > 0 && (
                    <p className="fine" style={{ marginBottom: 0 }}>
                        Follow-up on the Tasks tab:{' '}
                        {follow.map((t, i) => (
                            <span key={t.id}>
                                {i > 0 && ', '}
                                <a className="plink" href={href.task(t)}>
                                    {t.title}
                                </a>
                            </span>
                        ))}
                        .
                    </p>
                )}
            </div>
            {CAR_SECTIONS.map((s) => {
                const photos = carPhotos(s);
                return (
                    <div className="panel" key={s.key}>
                        <h3>{s.title}</h3>
                        <div className="cargrid">
                            {photos.map((p, i) => (
                                <figure className="cfig" key={p.src}>
                                    <button
                                        className="cthumb"
                                        aria-label={`Open ${s.title} photo ${i + 1} of ${photos.length}: ${p.caption}`}
                                        onClick={() => setOpen({ photos, index: i, label: s.title })}
                                    >
                                        <img src={p.thumb} alt="" loading="lazy" draggable="false" />
                                    </button>
                                    <figcaption>{p.caption}</figcaption>
                                </figure>
                            ))}
                        </div>
                    </div>
                );
            })}
            {open && (
                <PhotoViewer
                    photos={open.photos.map((p) => p.src)}
                    captions={open.photos.map((p) => p.caption)}
                    index={open.index}
                    label={open.label}
                    onClose={() => setOpen(null)}
                />
            )}
        </section>
    );
}
