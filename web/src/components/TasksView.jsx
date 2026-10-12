// Tasks, grouped by phase: name, done checkbox and edit/delete icons. Click a task for its page.
import { useState } from 'react';
import { api } from '../api.js';
import { RowActions, AddButton, FormButtons } from './ui.jsx';
import { PHASES, phaseClass, href } from '../constants.js';

export function TaskForm({ task, parts, onSaved, onCancel }) {
  const [f, setF] = useState({ title: task?.title || '', phase: String(task?.phase || 1), notes: task?.notes || '' });
  const [picked, setPicked] = useState(() => new Set((task?.parts || []).map((p) => p.id)));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  const sorted = [...parts].sort((a, b) => (picked.has(b.id) - picked.has(a.id)) || a.label.localeCompare(b.label));
  const needle = q.trim().toLowerCase();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { title: f.title, phase: Number(f.phase), notes: f.notes, partIds: [...picked] };
    try {
      onSaved(task ? await api.tasks.update(task.id, body) : await api.tasks.create(body));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h3 id="form-title">{task ? 'Edit task' : 'Add task'}</h3>
      <label>Task<input value={f.title} onChange={set('title')} required maxLength={200} placeholder="e.g. Install the Injen intake" autoFocus /></label>
      <label>Phase
        <select value={f.phase} onChange={set('phase')}>
          {Object.entries(PHASES).map(([n, name]) => <option key={n} value={n}>Phase {n}: {name}</option>)}
        </select>
      </label>
      <label>Description<textarea rows={4} value={f.notes} onChange={set('notes')} /></label>
      <fieldset className="ppick">
        <legend>Parts</legend>
        <input type="search" placeholder="Search parts" aria-label="Search parts" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="plist">
          {sorted.map((p) => (
            <label key={p.id} className={`pp${needle && !`${p.label} ${p.partNumber}`.toLowerCase().includes(needle) ? ' hid' : ''}`}>
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />{p.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="err" role="alert">{error}</p>}
      <FormButtons onCancel={onCancel} busy={busy} />
    </form>
  );
}

export function TasksView({ tasks, canEdit, onAdd, onToggle, onEdit, onDelete }) {
  const open = (t) => (e) => { if (!e.target.closest('a,button,input')) window.location.hash = href.task(t); };
  return (
    <section className="view" style={{ display: 'grid', gap: 20 }}>
      <div className="bar"><span className="spacer" />{canEdit && <AddButton label="Add task" onClick={onAdd} />}</div>
      {!tasks.length ? <div className="empty">No tasks yet.</div> : (
        <div className="tasks">
          {[1, 2, 3, 4].map((n) => {
            const list = tasks.filter((t) => t.phase === n).sort((a, b) => (a.done - b.done) || String(a.createdAt).localeCompare(String(b.createdAt)));
            const openN = list.filter((t) => !t.done).length;
            return (
              <section className="phase" key={n}>
                <h3 className="phead"><span className={`pill ${phaseClass(n)}`}>Phase {n}</span>{PHASES[n]} <span className="gn">{openN} open</span></h3>
                {!list.length ? <div className="empty sm">No tasks in this phase.</div> : list.map((t) => (
                  <div className={`task trow${t.done ? ' done' : ''}`} key={t.id} onClick={open(t)}>
                    <input type="checkbox" checked={t.done} disabled={!canEdit} onChange={(e) => onToggle(t, e.target.checked)} aria-label={`Done: ${t.title}`} />
                    <a className="tlink" href={href.task(t)}>{t.title}</a>
                    {canEdit && <RowActions className="tools" onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} deleteLabel="Delete task" confirmText="Delete?" />}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
