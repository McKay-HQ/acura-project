import { useRef, useState, type MouseEvent } from 'react';
import { CAR_SECTIONS, carPhotos, type CarPhoto, type CarSection } from '../car';
import type { Task, TaskActionHandlers } from '../types';
import PhotoViewer from './PhotoViewer';

interface TaskStepsProps {
    task: Task;
    canEdit: boolean;
    onStep: TaskActionHandlers['onStep'];
}

const isExternal = (href: string) => /^https?:/.test(href);

interface StepPhoto {
    ref: string;
    section: CarSection;
    i: number;
    all: CarPhoto[];
}

/** A step's photo ref like "engine:03" -> that section's photos and the index into them. */
function resolve(ref: string): StepPhoto | null {
    const [key, n] = ref.split(':');
    const section = CAR_SECTIONS.find((s) => s.key === key);
    const i = Number(n) - 1;
    if (!section || !(i >= 0 && i < section.count)) return null;
    return { ref, section, i, all: carPhotos(section) };
}

// A task's instructions as a checklist. Steps point at their photos with footnote numbers; the
// photos are listed under the steps, numbered in the order the steps first use them. Links open
// app pages in place and other sites in a new tab; photos open in the viewer with their captions.
export default function TaskSteps({ task, canEdit, onStep }: TaskStepsProps) {
    const [open, setOpen] = useState<StepPhoto | null>(null);
    const figs = useRef<Record<number, HTMLElement | null>>({});
    const photos: StepPhoto[] = [];
    for (const s of task.steps)
        for (const ref of s.photos || []) {
            const p = resolve(ref);
            if (p && !photos.some((x) => x.ref === ref)) photos.push(p);
        }
    const num = (ref: string) => photos.findIndex((x) => x.ref === ref) + 1;
    const jump = (n: number) => (e: MouseEvent) => {
        e.preventDefault();
        const f = figs.current[n];
        if (!f) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        f.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        f.classList.remove('flash');
        void f.offsetWidth;
        f.classList.add('flash');
    };

    return (
        <>
            <ol className="steps">
                {task.steps.map((s, j) => {
                    const fns = [...new Set((s.photos || []).map(num).filter((n) => n > 0))];
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
                                <span className="stext">
                                    {s.text}
                                    {fns.map((n) => (
                                        <sup className="sfn" key={n}>
                                            <a href={`#photo-${n}`} onClick={jump(n)} aria-label={`See photo ${n}`}>
                                                {n}
                                            </a>
                                        </sup>
                                    ))}
                                </span>
                            </label>
                            {s.links?.length ? (
                                <div className="sextra">
                                    {s.links.map((l) => (
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
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
            {photos.length > 0 && (
                <div className="tphotos">
                    <h3>Photos</h3>
                    <div className="tpgrid">
                        {photos.map((p, k) => {
                            const photo = p.all[p.i];
                            return (
                                <figure
                                    className="tpfig"
                                    key={p.ref}
                                    ref={(el) => {
                                        figs.current[k + 1] = el;
                                    }}
                                >
                                    <button
                                        className="sphoto"
                                        aria-label={`Open photo ${k + 1}: ${photo.caption}`}
                                        onClick={() => setOpen(p)}
                                    >
                                        <img src={photo.thumb} alt="" loading="lazy" draggable="false" />
                                    </button>
                                    <figcaption>
                                        <b>{k + 1}</b> {photo.caption}
                                    </figcaption>
                                </figure>
                            );
                        })}
                    </div>
                </div>
            )}
            {open && (
                <PhotoViewer
                    photos={open.all.map((x) => x.src)}
                    captions={open.all.map((x) => x.caption)}
                    index={open.i}
                    label={open.section.title}
                    onClose={() => setOpen(null)}
                />
            )}
        </>
    );
}
