// Tasks, grouped by phase: name, done checkbox and edit/delete icons. Click a task for its page.
import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { api, errorMessage } from '../api';
import { RowActions, AddButton, FormButtons } from './ui';
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
}

export function TaskForm({ task, parts, onSaved, onCancel }: TaskFormProps) {
    const [f, setF] = useState<TaskFields>({
        title: task?.title || '',
        phase: String(task?.phase || 1),
        notes: task?.notes || '',
    });
    const [picked, setPicked] = useState<Set<string>>(() => new Set((task?.parts || []).map((p) => p.id)));
    const [q, setQ] = useState<string>('');
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const set = (k: keyof TaskFields) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setF({ ...f, [k]: e.target.value });
    const toggle = (id: string) => {
        const n = new Set(picked);
        n.has(id) ? n.delete(id) : n.add(id);
        setPicked(n);
    };
    const sorted = [...parts].sort(
        (a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)) || a.label.localeCompare(b.label),
    );
    const needle = q.trim().toLowerCase();

    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setBusy(true);
        setError('');
        // Cast: the phase <select> only offers the PHASES keys 1..4.
        const body: Omit<TaskInput, 'done'> = {
            title: f.title,
            phase: Number(f.phase) as Phase,
            notes: f.notes,
            partIds: [...picked],
        };
        try {
            onSaved(task ? await api.tasks.update(task.id, body) : await api.tasks.create(body));
        } catch (err) {
            setError(errorMessage(err));
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
                    {Object.entries(PHASES).map(([n, name]) => (
                        <option key={n} value={n}>
                            Phase {n}: {name}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Description
                <textarea rows={4} value={f.notes} onChange={set('notes')} />
            </label>
            <fieldset className="ppick">
                <legend>Parts</legend>
                <input
                    type="search"
                    placeholder="Search parts"
                    aria-label="Search parts"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <div className="plist">
                    {sorted.map((p) => (
                        <label
                            key={p.id}
                            className={`pp${needle && !`${p.label} ${p.partNumber}`.toLowerCase().includes(needle) ? ' hid' : ''}`}
                        >
                            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                            {p.label}
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
    const open = (t: Task) => (e: MouseEvent<HTMLElement>) => {
        if (!isWithin(e.target, 'a,button,input')) window.location.hash = href.task(t);
    };
    return (
        <section className="view" style={{ display: 'grid', gap: 20 }}>
            <div className="bar">
                <span className="spacer" />
                {canEdit && <AddButton label="Add task" onClick={onAdd} />}
            </div>
            {!tasks.length ? (
                <div className="empty">No tasks yet.</div>
            ) : (
                <div className="tasks">
                    {PHASE_NUMBERS.map((n) => {
                        const list = tasks
                            .filter((t) => t.phase === n)
                            .sort(
                                (a, b) =>
                                    Number(a.done) - Number(b.done) ||
                                    String(a.createdAt).localeCompare(String(b.createdAt)),
                            );
                        const openN = list.filter((t) => !t.done).length;
                        return (
                            <section className="phase" key={n}>
                                <h3 className="phead">
                                    <span className={`pill ${phaseClass(n)}`}>Phase {n}</span>
                                    {PHASES[n]} <span className="gn">{openN} open</span>
                                </h3>
                                {!list.length ? (
                                    <div className="empty sm">No tasks in this phase.</div>
                                ) : (
                                    list.map((t) => (
                                        <div
                                            className={`task trow${t.done ? ' done' : ''}`}
                                            key={t.id}
                                            onClick={open(t)}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={t.done}
                                                disabled={!canEdit}
                                                onChange={(e) => onToggle(t, e.target.checked)}
                                                aria-label={`Done: ${t.title}`}
                                            />
                                            <a className="tlink" href={href.task(t)}>
                                                {t.title}
                                            </a>
                                            {canEdit && (
                                                <RowActions
                                                    className="tools"
                                                    onEdit={() => onEdit(t)}
                                                    onDelete={() => onDelete(t)}
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
