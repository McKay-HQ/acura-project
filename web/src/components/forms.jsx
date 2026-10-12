// Add/edit forms for parts, containers and tossed records. Existing photos can be
// reordered or deleted in place; new photos upload when the form is saved.
import { useState } from 'react';
import { api } from '../api.js';
import { PhotoEditor, FormButtons } from './ui.jsx';
import { BOX_ICONS } from './Icons.jsx';
import { STATUSES, FITS, SUGGESTED_TAGS, parseTags, topContainers, subContainers } from '../constants.js';

const num = (v) => (v === '' || v == null ? null : Number(v));

/** Shared state for a record's photos inside an edit form. */
function usePhotos(resource, record, onSaved, setError) {
  const [photos, setPhotos] = useState(record?.photos || []);
  const run = async (fn) => {
    setError('');
    try {
      const updated = await fn();
      setPhotos(updated.photos);
      onSaved(updated, { keepOpen: true });
    } catch (err) {
      setError(err.message);
    }
  };
  return {
    photos,
    editor: record && (
      <PhotoEditor
        photos={photos}
        onMakeMain={(p) => run(() => resource.reorderPhotos(record.id, [p.id, ...photos.filter((x) => x.id !== p.id).map((x) => x.id)]))}
        onDelete={(p) => run(() => api.deletePhoto(p.id))}
      />
    ),
  };
}

function useSubmit(resource, record, onSaved) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(fields) {
    setBusy(true);
    setError('');
    try {
      let saved;
      if (record) {
        saved = await resource.update(record.id, fields);
        if (files.length) saved = await resource.addPhotos(record.id, files);
      } else {
        saved = await resource.create(fields, files);
      }
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  const fileInput = (
    <label>
      {record ? 'Add photos' : 'Photos'}
      <input type="file" accept="image/*" multiple onChange={(e) => setFiles([...e.target.files])} />
    </label>
  );
  const buttons = (onCancel) => (
    <>
      {error && <p className="err" role="alert">{error}</p>}
      <FormButtons onCancel={onCancel} busy={busy} />
    </>
  );
  return { save, fileInput, buttons, setError };
}

export function PartForm({ part, containers, tagOptions, onSaved, onCancel }) {
  const [f, setF] = useState(() => ({
    label: part?.label || '',
    partNumber: part?.partNumber || '',
    status: part?.status || 'Unverified',
    fits: part?.fits || '',
    tags: (part?.tags || []).join(', '),
    valueLow: part?.valueLow ?? '',
    valueHigh: part?.valueHigh ?? '',
    containerId: part?.container?.id || '',
    notes: part?.notes || '',
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const { save, fileInput, buttons, setError } = useSubmit(api.parts, part, onSaved);
  const { editor } = usePhotos(api.parts, part, onSaved, setError);
  const tagList = [...new Set([...SUGGESTED_TAGS, ...(tagOptions || [])])];

  const submit = (e) => {
    e.preventDefault();
    save({
      label: f.label, partNumber: f.partNumber, status: f.status, fits: f.fits, tags: parseTags(f.tags),
      valueLow: num(f.valueLow), valueHigh: num(f.valueHigh), containerId: f.containerId || null, notes: f.notes,
    });
  };

  return (
    <form onSubmit={submit}>
      <h3 id="form-title">{part ? 'Edit part' : 'Add part'}</h3>
      <label>Name<input value={f.label} onChange={set('label')} required maxLength={200} placeholder="e.g. Cruise control actuator" autoFocus /></label>
      <label>Part number / markings<input value={f.partNumber} onChange={set('partNumber')} maxLength={300} placeholder="e.g. 73162-S6M" /></label>
      <div className="row">
        <label>Status
          <select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label>Fits
          <input value={f.fits} onChange={set('fits')} list="fits-list" maxLength={60} placeholder="e.g. RSX, S2000" />
          <datalist id="fits-list">{FITS.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <label>Tags
        <input value={f.tags} onChange={set('tags')} list="tags-list" maxLength={400} placeholder="Comma-separated, e.g. Body & trim, Spare, For sale" />
        <datalist id="tags-list">{tagList.map((t) => <option key={t} value={t} />)}</datalist>
      </label>
      <div className="row">
        <label>Value, low ($)<input type="number" min="0" step="5" inputMode="decimal" value={f.valueLow} onChange={set('valueLow')} /></label>
        <label>Value, high ($)<input type="number" min="0" step="5" inputMode="decimal" value={f.valueHigh} onChange={set('valueHigh')} /></label>
      </div>
      <label>Container
        <select value={f.containerId} onChange={set('containerId')}>
          <option value="">No container</option>
          {topContainers(containers || []).map((b) => {
            const subs = subContainers(containers, b.id);
            return subs.length ? (
              <optgroup key={b.id} label={b.name}>
                <option value={b.id}>{b.name} (not in a sub-container)</option>
                {subs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </optgroup>
            ) : <option key={b.id} value={b.id}>{b.name}</option>;
          })}
        </select>
      </label>
      <label>Notes<textarea rows={4} value={f.notes} onChange={set('notes')} /></label>
      {editor}
      {fileInput}
      {buttons(onCancel)}
    </form>
  );
}

export function ContainerForm({ container, containers = [], onSaved, onCancel }) {
  const [f, setF] = useState({
    name: container?.name || '', location: container?.location || '', notes: container?.notes || '',
    parentId: container?.parentId || '', icon: container?.icon || 'box',
  });
  const hasSubs = Boolean(container) && subContainers(containers, container.id).length > 0;
  const parents = topContainers(containers).filter((b) => b.id !== container?.id);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const { save, fileInput, buttons, setError } = useSubmit(api.containers, container, onSaved);
  const { editor } = usePhotos(api.containers, container, onSaved, setError);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const { parentId, ...rest } = f;
      save(hasSubs ? rest : { ...rest, parentId: parentId || null });
    }}>
      <h3 id="form-title">{container ? 'Edit container' : 'Add container'}</h3>
      <label>Name<input value={f.name} onChange={set('name')} required maxLength={120} placeholder="e.g. Gray bin 1" autoFocus /></label>
      <label>Location<input value={f.location} onChange={set('location')} maxLength={200} placeholder="e.g. Garage shelf, top" /></label>
      <div className="row">
        <label>Inside
          <select value={f.parentId} onChange={set('parentId')} disabled={hasSubs}>
            <option value="">Nothing (top-level container)</option>
            {parents.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>Icon
          <select value={f.icon} onChange={set('icon')}>
            {Object.entries(BOX_ICONS).map(([k, [name]]) => <option key={k} value={k}>{name}</option>)}
          </select>
        </label>
      </div>
      <label>Notes<textarea rows={4} value={f.notes} onChange={set('notes')} /></label>
      {editor}
      {fileInput}
      {buttons(onCancel)}
    </form>
  );
}

export function TossedForm({ item, onSaved, onCancel }) {
  const [f, setF] = useState({
    label: item?.label || '', partNumber: item?.partNumber || '', reason: item?.reason || '',
    tossedOn: item?.tossedOn || new Date().toLocaleDateString('en-CA'),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const { save, fileInput, buttons, setError } = useSubmit(api.tossed, item, onSaved);
  const { editor } = usePhotos(api.tossed, item, onSaved, setError);
  return (
    <form onSubmit={(e) => { e.preventDefault(); save({ ...f, tossedOn: f.tossedOn || null }); }}>
      <h3 id="form-title">{item ? 'Edit tossed item' : 'Log a tossed item'}</h3>
      <label>Name<input value={f.label} onChange={set('label')} required maxLength={200} autoFocus /></label>
      <label>Part number / markings<input value={f.partNumber} onChange={set('partNumber')} maxLength={300} /></label>
      <label>Why it was tossed<textarea rows={3} value={f.reason} onChange={set('reason')} /></label>
      <label>Date tossed<input type="date" value={f.tossedOn} onChange={set('tossedOn')} /></label>
      {editor}
      {fileInput}
      {buttons(onCancel)}
    </form>
  );
}

/** Small form shown when tossing a part from the Parts tab. */
export function TossPartForm({ part, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await api.parts.toss(part.id, { reason }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <h3 id="form-title">Toss “{part.label}”</h3>
      <p className="mini" style={{ margin: 0 }}>It moves to the Tossed tab with its photos, so there's a record if something turns up missing later.</p>
      <label>Why<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong model (SR3 Civic)" autoFocus /></label>
      {error && <p className="err" role="alert">{error}</p>}
      <FormButtons onCancel={onCancel} busy={busy} saveLabel="Toss it" danger />
    </form>
  );
}
