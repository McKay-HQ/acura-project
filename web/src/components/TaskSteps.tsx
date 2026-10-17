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
    const [key, num] = ref.split(':');
    const section = CAR_SECTIONS.find((candidate) => candidate.key === key);
    const index = Number(num) - 1;
    if (!section || !(index >= 0 && index < section.count)) return null;
    return { ref, section, i: index, all: carPhotos(section) };
}

// A task's instructions as a checklist. Steps point at their photos with footnote numbers; the
// photos are listed under the steps, numbered in the order the steps first use them. Links open
// app pages in place and other sites in a new tab; photos open in the viewer with their captions.
export default function TaskSteps({ task, canEdit, onStep }: TaskStepsProps) {
    const [open, setOpen] = useState<StepPhoto | null>(null);
    const figs = useRef<Record<number, HTMLElement | null>>({});
    const photos: StepPhoto[] = [];
    for (const step of task.steps)
        for (const ref of step.photos || []) {
            const photo = resolve(ref);
            if (photo && !photos.some((existing) => existing.ref === ref)) photos.push(photo);
        }
    const num = (ref: string) => photos.findIndex((existing) => existing.ref === ref) + 1;
    const jump = (footnote: number) => (event: MouseEvent) => {
        event.preventDefault();
        const fig = figs.current[footnote];
        if (!fig) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        fig.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        fig.classList.remove('flash');
        void fig.offsetWidth;
        fig.classList.add('flash');
    };

    return (
        <>
            <ol className="steps">
                {task.steps.map((step, stepIndex) => {
                    const fns = [...new Set((step.photos || []).map(num).filter((footnote) => footnote > 0))];
                    return (
                        <li key={stepIndex} className={step.done ? 'sdone' : undefined}>
                            <label className="scheck">
                                <input
                                    type="checkbox"
                                    checked={step.done}
                                    disabled={!canEdit}
                                    onChange={(event) => onStep(task, stepIndex, event.target.checked)}
                                />
                                <span className="snum">{stepIndex + 1}</span>
                                <span className="stext">
                                    {step.text}
                                    {fns.map((footnote) => (
                                        <sup className="sfn" key={footnote}>
                                            <a
                                                href={`#photo-${footnote}`}
                                                onClick={jump(footnote)}
                                                aria-label={`See photo ${footnote}`}
                                            >
                                                {footnote}
                                            </a>
                                        </sup>
                                    ))}
                                </span>
                            </label>
                            {step.links?.length ? (
                                <div className="sextra">
                                    {step.links.map((link) => (
                                        <a
                                            key={link.href + link.label}
                                            className="slink"
                                            href={link.href}
                                            {...(isExternal(link.href) ? { target: '_blank', rel: 'noopener' } : {})}
                                        >
                                            {link.label}
                                            {isExternal(link.href) && ' ↗'}
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
                        {photos.map((stepPhoto, photoIndex) => {
                            const photo = stepPhoto.all[stepPhoto.i];
                            return (
                                <figure
                                    className="tpfig"
                                    key={stepPhoto.ref}
                                    ref={(el) => {
                                        figs.current[photoIndex + 1] = el;
                                    }}
                                >
                                    <button
                                        className="sphoto"
                                        aria-label={`Open photo ${photoIndex + 1}: ${photo.caption}`}
                                        onClick={() => setOpen(stepPhoto)}
                                    >
                                        <img src={photo.thumb} alt="" loading="lazy" draggable="false" />
                                    </button>
                                    <figcaption>
                                        <b>{photoIndex + 1}</b> {photo.caption}
                                    </figcaption>
                                </figure>
                            );
                        })}
                    </div>
                </div>
            )}
            {open && (
                <PhotoViewer
                    photos={open.all.map((photo) => photo.src)}
                    captions={open.all.map((photo) => photo.caption)}
                    index={open.i}
                    label={open.section.title}
                    onClose={() => setOpen(null)}
                />
            )}
        </>
    );
}
