// Tasks, grouped by phase: name, done checkbox and edit/delete icons. Click a task for its page.
import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { api, errorMessage, PreconditionFailedError } from '../api';
import { useEditFields, clashText, CONFLICT_IN_FORM } from './forms';
import { RowActions, AddButton, FormButtons, NavTools } from './ui';
import StepsEditor, { fromDraft, toDraft, type DraftStep } from './StepsEditor';
import { PHASES, PHASE_NUMBERS, phaseClass, href, isWithin } from '../constants';
import type { Part, Phase, Task, TaskActionHandlers, TaskInput } from '../types';

interface TaskFormProps {
    task?: Task;
    parts: Part[];
    onSaved: (task: Task) => void;
    onCancel: () => void;
}
interface TaskFields {
    title: string;
    /** The <select> value, "1".."4". */
    phase: string;
    notes: string;
    partIds: string[];
    steps: DraftStep[];
}

const taskFields = (task?: Task): TaskFields => ({
    title: task?.title || '',
    phase: String(task?.phase || 1),
    notes: task?.notes || '',
    partIds: (task?.parts || []).map((part) => part.id),
    steps: toDraft(task?.steps),
});
// Cast: the phase <select> only offers the PHASES keys 1..4. Part ids are sorted so order doesn't count as a change.
const taskInput = (fields: TaskFields): Omit<TaskInput, 'done'> => ({
    title: fields.title,
    phase: Number(fields.phase) as Phase,
    notes: fields.notes,
    partIds: [...fields.partIds].sort(),
    steps: fromDraft(fields.steps),
});
const TASK_LABELS: Record<keyof TaskFields, string> = {
    title: 'Task',
    phase: 'Phase',
    notes: 'Description',
    partIds: 'Parts for this task',
    steps: 'Steps',
};

export function TaskForm({ task, parts, onSaved, onCancel }: TaskFormProps) {
    const edit = useEditFields(taskFields(task), taskInput, TASK_LABELS);
    const { f, setF } = edit;
    const picked = new Set(f.partIds);
    const [query, setQuery] = useState<string>('');
    // The task as of this form's last write; its version goes with the save (not refreshed from the list).
    const [rec, setRec] = useState<Task | undefined>(task);
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [focusStep, setFocusStep] = useState<number>();
    const set =
        (key: Exclude<keyof TaskFields, 'partIds' | 'steps'>) =>
        (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setF({ ...f, [key]: event.target.value });
    const toggle = (id: string) =>
        setF({ ...f, partIds: picked.has(id) ? f.partIds.filter((partId) => partId !== id) : [...f.partIds, id] });
    const sorted = [...parts].sort(
        (left, right) =>
            Number(picked.has(right.id)) - Number(picked.has(left.id)) || left.label.localeCompare(right.label),
    );
    const needle = query.trim().toLowerCase();

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            if (rec) {
                // Only the fields the user changed, so other people's changes to the rest survive.
                const body = edit.changes();
                onSaved(Object.keys(body).length ? await api.tasks.update(rec, body) : rec);
            } else {
                onSaved(await api.tasks.create(edit.input()));
            }
        } catch (err) {
            if (err instanceof PreconditionFailedError && rec) {
                // Keep the typed values; take the current values for untouched fields and its version.
                const current = err.currentFor(rec);
                let clashes = '';
                if (current) {
                    setRec(current);
                    clashes = clashText(edit.rebase(taskFields(current)));
                }
                setError(CONFLICT_IN_FORM + clashes);
            } else {
                setError(errorMessage(err));
            }
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit}>
            <h3 id="form-title">{task ? 'Edit task' : 'Add task'}</h3>
            <label>
                Task
                <input
                    value={f.title}
                    onChange={set('title')}
                    required
                    maxLength={200}
                    placeholder="e.g. Install the Injen intake"
                    autoFocus
                />
            </label>
            <label>
                Phase
                <select value={f.phase} onChange={set('phase')}>
                    {Object.entries(PHASES).map(([phase, name]) => (
                        <option key={phase} value={phase}>
                            Phase {phase}: {name}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Description
                <textarea rows={4} value={f.notes} onChange={set('notes')} />
            </label>
            <StepsEditor
                steps={f.steps}
                onChange={(steps) => setF({ ...f, steps })}
                focusId={focusStep}
                onAdded={setFocusStep}
            />
            <fieldset className="ppick">
                <legend>Parts</legend>
                <input
                    type="search"
                    placeholder="Search parts"
                    aria-label="Search parts"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
                <div className="plist">
                    {sorted.map((part) => (
                        <label
                            key={part.id}
                            className={`pp${needle && !`${part.label} ${part.partNumber}`.toLowerCase().includes(needle) ? ' hid' : ''}`}
                        >
                            <input type="checkbox" checked={picked.has(part.id)} onChange={() => toggle(part.id)} />
                            {part.label}
                        </label>
                    ))}
                </div>
            </fieldset>
            {error && (
                <p className="err" role="alert">
                    {error}
                </p>
            )}
            <FormButtons onCancel={onCancel} busy={busy} />
        </form>
    );
}

interface TasksViewProps extends TaskActionHandlers {
    tasks: Task[];
    canEdit: boolean;
    onAdd: () => void;
}

export function TasksView({ tasks, canEdit, onAdd, onToggle, onEdit, onDelete }: TasksViewProps) {
    const open = (task: Task) => (event: MouseEvent<HTMLElement>) => {
        if (!isWithin(event.target, 'a,button,input')) window.location.hash = href.task(task);
    };
    return (
        <section className="view" style={{ display: 'grid', gap: '1.25rem' }}>
            <div className="bar">
                <span className="spacer" />
                {canEdit && (
                    <NavTools>
                        <AddButton label="Add task" onClick={onAdd} />
                    </NavTools>
                )}
            </div>
            {!tasks.length ? (
                <div className="empty">No tasks yet.</div>
            ) : (
                <div className="tasks">
                    {PHASE_NUMBERS.map((phase) => {
                        const list = tasks
                            .filter((task) => task.phase === phase)
                            .sort(
                                (left, right) =>
                                    Number(left.done) - Number(right.done) ||
                                    String(left.createdAt).localeCompare(String(right.createdAt)),
                            );
                        const openN = list.filter((task) => !task.done).length;
                        return (
                            <section className="phase" key={phase}>
                                <h3 className="phead">
                                    <span className={`pill ${phaseClass(phase)}`}>Phase {phase}</span>
                                    {PHASES[phase]} <span className="gn">{openN} open</span>
                                </h3>
                                {!list.length ? (
                                    <div className="empty sm">No tasks in this phase.</div>
                                ) : (
                                    list.map((task) => (
                                        <div
                                            className={`task trow${task.done ? ' done' : ''}`}
                                            key={task.id}
                                            onClick={open(task)}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={task.done}
                                                disabled={!canEdit || task.steps.length > 0}
                                                title={
                                                    task.steps.length ? 'Done when all steps are checked' : undefined
                                                }
                                                onChange={(event) => onToggle(task, event.target.checked)}
                                                aria-label={`Done: ${task.title}`}
                                            />
                                            <a className="tlink" href={href.task(task)}>
                                                {task.title}
                                                {task.steps.length > 0 && (
                                                    <span className="sprog">
                                                        {' '}
                                                        {task.steps.filter((step) => step.done).length} of{' '}
                                                        {task.steps.length} steps
                                                    </span>
                                                )}
                                            </a>
                                            {canEdit && (
                                                <RowActions
                                                    className="tools"
                                                    onEdit={() => onEdit(task)}
                                                    onDelete={() => onDelete(task)}
                                                    deleteLabel="Delete task"
                                                    confirmText="Delete?"
                                                />
                                            )}
                                        </div>
                                    ))
                                )}
                            </section>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
