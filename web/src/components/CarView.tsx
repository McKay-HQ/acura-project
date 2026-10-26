import { useState } from 'react';
import { CAR_SECTIONS, CONDITION, CONDITION_DATE, CONDITION_TASKS, carPhotos, type CarPhoto } from '../car';
import { findRef, href } from '../constants';
import type { Task } from '../types';
import PhotoViewer from './PhotoViewer';
import CarStrip from './CarStrip';

interface CarViewProps {
    tasks: Task[];
}

function ConditionList({ title, items, first }: { title: string; items: string[]; first?: boolean }) {
    return (
        <>
            <h4 className={first ? 'condh first' : 'condh'}>{title}</h4>
            <ul className="condlist">
                {items.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </>
    );
}

// The car itself: what the latest photos show, then the photos by area. On phones each area is a
// row to swipe; from 45em it's a grid of four thumbnails per row. Any photo opens the viewer.
export default function CarView({ tasks }: CarViewProps) {
    const [open, setOpen] = useState<{ photos: CarPhoto[]; index: number; label: string } | null>(null);
    const follow = CONDITION_TASKS.map((key) => findRef(tasks, key)).filter((task): task is Task => !!task);

    return (
        <section id="carView" style={{ display: 'grid', gap: '1rem' }}>
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
                        {follow.map((task, index) => (
                            <span key={task.id}>
                                {index > 0 && ', '}
                                <a className="plink" href={href.task(task)}>
                                    {task.title}
                                </a>
                            </span>
                        ))}
                        .
                    </p>
                )}
            </div>
            {CAR_SECTIONS.map((section) => {
                const photos = carPhotos(section);
                return (
                    <div className="panel" key={section.key}>
                        <h3>{section.title}</h3>
                        <CarStrip
                            title={section.title}
                            photos={photos}
                            onOpen={(index) => setOpen({ photos, index, label: section.title })}
                        />
                    </div>
                );
            })}
            {open && (
                <PhotoViewer
                    photos={open.photos.map((photo) => photo.src)}
                    captions={open.photos.map((photo) => photo.caption)}
                    index={open.index}
                    label={open.label}
                    onClose={() => setOpen(null)}
                />
            )}
        </section>
    );
}
