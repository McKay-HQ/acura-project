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
export const fromDraft = (drafts: DraftStep[]): TaskStep[] =>
    drafts.map((draft) => ({ ...draft.step, text: draft.step.text.trim() })).filter((step) => step.text);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

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
            const textarea = ref.current;
            if (!textarea) return;
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight + 2}px`;
        };
        fit();
        // Again once the dialog has opened and laid out (the first pass can run before it's visible).
        const raf = requestAnimationFrame(fit);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    useLayoutEffect(() => {
        if (focus) ref.current?.focus();
    }, [focus]);
    return (
        <textarea
            ref={ref}
            rows={2}
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        />
    );
}

interface StepsEditorProps {
    steps: DraftStep[];
    onChange: (steps: DraftStep[]) => void;
    focusId?: number;
    onAdded: (id: number) => void;
}

// Edit a task's step text: add, remove and reorder. A step keeps its checkmark, links and photos.
export default function StepsEditor({ steps, onChange, focusId, onAdded }: StepsEditorProps) {
    const count = steps.length;
    const move = (from: number, to: number) => {
        const next = [...steps];
        [next[from], next[to]] = [next[to], next[from]];
        onChange(next);
    };
    return (
        <fieldset className="sedit">
            <legend>Steps</legend>
            <div className="ssteps">
                {count === 0 && (
                    <p className="fine" style={{ margin: 0 }}>
                        No steps. Without steps, Done is checked by hand.
                    </p>
                )}
                {steps.map((draft, index) => {
                    const links = draft.step.links?.length || 0;
                    const photos = draft.step.photos?.length || 0;
                    return (
                        <div className="srow" key={draft.id}>
                            <span className="snum2">{index + 1}</span>
                            <StepText
                                value={draft.step.text}
                                label={`Step ${index + 1}`}
                                focus={draft.id === focusId}
                                onChange={(text) =>
                                    onChange(
                                        steps.map((other) =>
                                            other.id === draft.id ? { ...other, step: { ...other.step, text } } : other,
                                        ),
                                    )
                                }
                            />
                            <div className="sbtns">
                                <button
                                    type="button"
                                    className="ibtn"
                                    disabled={index === 0}
                                    title="Move up"
                                    aria-label={`Move step ${index + 1} up`}
                                    onClick={() => move(index, index - 1)}
                                >
                                    <Icon.up />
                                </button>
                                <button
                                    type="button"
                                    className="ibtn"
                                    disabled={index === count - 1}
                                    title="Move down"
                                    aria-label={`Move step ${index + 1} down`}
                                    onClick={() => move(index, index + 1)}
                                >
                                    <Icon.down />
                                </button>
                                <button
                                    type="button"
                                    className="ibtn del"
                                    title="Remove step"
                                    aria-label={`Remove step ${index + 1}`}
                                    onClick={() => onChange(steps.filter((other) => other.id !== draft.id))}
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
                    const [draft] = toDraft([{ text: '', done: false }]);
                    onChange([...steps, draft]);
                    onAdded(draft.id);
                }}
            >
                + Add step
            </button>
        </fieldset>
    );
}
