import { useState } from 'react';
import { CAR_SECTIONS, carPhotos } from '../car';
import type { Task, TaskActionHandlers } from '../types';
import PhotoViewer from './PhotoViewer';

interface TaskStepsProps {
    task: Task;
    canEdit: boolean;
    onStep: TaskActionHandlers['onStep'];
}

const isExternal = (href: string) => /^https?:/.test(href);

/** A step's photo ref like "engine:03" -> that section's photos and the index into them. */
function resolve(ref: string) {
    const [key, n] = ref.split(':');
    const section = CAR_SECTIONS.find((s) => s.key === key);
    const i = Number(n) - 1;
    if (!section || !(i >= 0 && i < section.count)) return null;
    return { section, i, photos: carPhotos(section) };
}

// A task's instructions as a checklist. Links open app pages in place and other sites in a new tab;
// photos open in the full-screen viewer with the rest of their Car tab section.
export default function TaskSteps({ task, canEdit, onStep }: TaskStepsProps) {
    const [open, setOpen] = useState<{ photos: string[]; index: number; label: string } | null>(null);
    return (
        <>
            <ol className="steps">
                {task.steps.map((s, j) => {
                    const photos = (s.photos || []).map(resolve).filter((x) => x !== null);
                    return (
                        <li key={j} className={s.done ? 'sdone' : undefined}>
                            <label className="scheck">
                                <input
                                    type="checkbox"
                                    checked={s.done}
                                    disabled={!canEdit}
                                    onChange={(e) => onStep(task, j, e.target.checked)}
                                />
                                <span className="snum">{j + 1}</span>
                                <span className="stext">{s.text}</span>
                            </label>
                            {(s.links?.length || photos.length > 0) && (
                                <div className="sextra">
                                    {s.links?.map((l) => (
                                        <a
                                            key={l.href + l.label}
                                            className="slink"
                                            href={l.href}
                                            {...(isExternal(l.href) ? { target: '_blank', rel: 'noopener' } : {})}
                                        >
                                            {l.label}
                                            {isExternal(l.href) && ' ↗'}
                                        </a>
                                    ))}
                                    {photos.length > 0 && (
                                        <div className="sphotos">
                                            {photos.map(({ section, i, photos: all }) => (
                                                <button
                                                    key={`${section.key}:${i}`}
                                                    className="sphoto"
                                                    aria-label={`Open ${section.title} photo ${i + 1}`}
                                                    onClick={() =>
                                                        setOpen({
                                                            photos: all.map((p) => p.src),
                                                            index: i,
                                                            label: section.title,
                                                        })
                                                    }
                                                >
                                                    <img src={all[i].thumb} alt="" loading="lazy" draggable="false" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
            {open && (
                <PhotoViewer photos={open.photos} index={open.index} label={open.label} onClose={() => setOpen(null)} />
            )}
        </>
    );
}
