import { useLayoutEffect, useRef } from 'react';
import { Icon } from './Icons';
import type { TaskStep } from '../types';

/** A step in the form, with a key that survives reordering. */
export interface DraftStep {
    id: number;
    step: TaskStep;
}

let nextId = 1;
export const toDraft = (steps: TaskStep[] = []): DraftStep[] => steps.map((step) => ({ id: nextId++, step }));
/** The steps to save: text trimmed, empty steps dropped. Checkmarks, links and photos are kept. */
export const fromDraft = (d: DraftStep[]): TaskStep[] =>
    d.map((x) => ({ ...x.step, text: x.step.text.trim() })).filter((s) => s.text);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function StepText({
    value,
    label,
    onChange,
    focus,
}: {
    value: string;
    label: string;
    onChange: (v: string) => void;
    focus: boolean;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    // Grow to fit the text.
    useLayoutEffect(() => {
        const fit = () => {
            const t = ref.current;
            if (!t) return;
            t.style.height = 'auto';
            t.style.height = `${t.scrollHeight + 2}px`;
        };
        fit();
        // Again once the dialog has opened and laid out (the first pass can run before it's visible).
        const raf = requestAnimationFrame(fit);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    useLayoutEffect(() => {
        if (focus) ref.current?.focus();
    }, [focus]);
    return <textarea ref={ref} rows={2} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />;
}

interface StepsEditorProps {
    steps: DraftStep[];
    onChange: (steps: DraftStep[]) => void;
    focusId?: number;
    onAdded: (id: number) => void;
}

// Edit a task's step text: add, remove and reorder. A step keeps its checkmark, links and photos.
export default function StepsEditor({ steps, onChange, focusId, onAdded }: StepsEditorProps) {
    const n = steps.length;
    const move = (i: number, j: number) => {
        const next = [...steps];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    return (
        <fieldset className="sedit">
            <legend>Steps</legend>
            <div className="ssteps">
                {n === 0 && (
                    <p className="fine" style={{ margin: 0 }}>
                        No steps. Without steps, Done is checked by hand.
                    </p>
                )}
                {steps.map((d, i) => {
                    const links = d.step.links?.length || 0;
                    const photos = d.step.photos?.length || 0;
                    return (
                        <div className="srow" key={d.id}>
                            <span className="snum2">{i + 1}</span>
                            <StepText
                                value={d.step.text}
                                label={`Step ${i + 1}`}
                                focus={d.id === focusId}
                                onChange={(text) =>
                                    onChange(
                                        steps.map((x) => (x.id === d.id ? { ...x, step: { ...x.step, text } } : x)),
                                    )
                                }
                            />
                            <div className="sbtns">
                                <button
                                    type="button"
                                    className="ibtn"
                                    disabled={i === 0}
                                    title="Move up"
                                    aria-label={`Move step ${i + 1} up`}
                                    onClick={() => move(i, i - 1)}
                                >
                                    <Icon.up />
                                </button>
                                <button
                                    type="button"
                                    className="ibtn"
                                    disabled={i === n - 1}
                                    title="Move down"
                                    aria-label={`Move step ${i + 1} down`}
                                    onClick={() => move(i, i + 1)}
                                >
                                    <Icon.down />
                                </button>
                                <button
                                    type="button"
                                    className="ibtn del"
                                    title="Remove step"
                                    aria-label={`Remove step ${i + 1}`}
                                    onClick={() => onChange(steps.filter((x) => x.id !== d.id))}
                                >
                                    <Icon.trash />
                                </button>
                            </div>
                            {(links > 0 || photos > 0) && (
                                <span className="fine skeep">
                                    Keeps its{' '}
                                    {[links && plural(links, 'link'), photos && plural(photos, 'photo')]
                                        .filter(Boolean)
                                        .join(' and ')}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <button
                type="button"
                className="btn sadd"
                onClick={() => {
                    const [d] = toDraft([{ text: '', done: false }]);
                    onChange([...steps, d]);
                    onAdded(d.id);
                }}
            >
                + Add step
            </button>
        </fieldset>
    );
}
