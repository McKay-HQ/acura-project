// Thin client for the API. Every call throws an Error with a readable message on failure.
// If the server requires an access key, it is kept in this browser (localStorage) and sent
// as a Bearer token; a 401 fires a "needkey" event so the app can ask for it.

const KEY_STORE = 'rsxApiKey';
export const keyStore = {
  get: () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } },
  set: (k) => { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch { /* storage blocked */ } },
};
export const authEvents = new EventTarget();

async function request(method, path, body) {
  const opts = { method, headers: {} };
  const key = keyStore.get();
  if (key) opts.headers.authorization = `Bearer ${key}`;
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new Error('Could not reach the server. Check that the app is running.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) authEvents.dispatchEvent(new Event('needkey'));
  if (!res.ok) {
    const details = Array.isArray(data.details) ? ` ${data.details.join('. ')}.` : '';
    const err = new Error((data.error || `Request failed (${res.status})`) + details);
    err.status = res.status;
    throw err;
  }
  return data;
}

function form(fields, files) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.append(k, Array.isArray(v) ? JSON.stringify(v) : v);
  }
  for (const f of files) fd.append('photos', f);
  return fd;
}

/** CRUD + photos for parts, containers and tossed. */
function resource(name) {
  return {
    list: (params) => request('GET', `/${name}${params ? `?${new URLSearchParams(params)}` : ''}`),
    get: (id) => request('GET', `/${name}/${encodeURIComponent(id)}`),
    create: (fields, files = []) => request('POST', `/${name}`, files.length ? form(fields, files) : fields),
    update: (id, fields) => request('PATCH', `/${name}/${encodeURIComponent(id)}`, fields),
    remove: (id) => request('DELETE', `/${name}/${encodeURIComponent(id)}`),
    addPhotos: (id, files) => request('POST', `/${name}/${encodeURIComponent(id)}/photos`, form({}, files)),
    reorderPhotos: (id, ids) => request('PUT', `/${name}/${encodeURIComponent(id)}/photos/order`, { ids }),
  };
}

export const api = {
  config: () => request('GET', '/config'),
  checkKey: () => request('POST', '/auth/check'),
  summary: () => request('GET', '/summary'),
  tags: () => request('GET', '/tags'),
  parts: { ...resource('parts'), toss: (id, body) => request('POST', `/parts/${encodeURIComponent(id)}/toss`, body) },
  containers: resource('containers'),
  tossed: resource('tossed'),
  deletePhoto: (photoId) => request('DELETE', `/photos/${photoId}`),
  tasks: {
    list: () => request('GET', '/tasks'),
    create: (f) => request('POST', '/tasks', f),
    update: (id, f) => request('PATCH', `/tasks/${id}`, f),
    remove: (id) => request('DELETE', `/tasks/${id}`),
  },
  notes: { list: () => request('GET', '/notes') },
};
