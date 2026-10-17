import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction,
} from 'react';
import { api, keyStore, authEvents, errorMessage, ApiError, PreconditionFailedError, CONFLICT_MESSAGE } from './api';
import { Icon } from './components/Icons';
import Modal from './components/Modal';
import Home from './components/Home';
import CarView from './components/CarView';
import ThemeToggle from './components/ThemeToggle';
import PartsView, { type Layout } from './components/PartsView';
import { PartDetail, ContainerDetail, TaskDetail } from './components/Details';
import { ContainersView, TossedView } from './components/OtherViews';
import { TasksView, TaskForm } from './components/TasksView';
import { PartForm, ContainerForm, TossedForm, TossPartForm } from './components/forms';
import { TagFilter } from './components/ui';
import { isForSale, FOR_SALE, findRef, topContainers } from './constants';
import type {
    AppConfig,
    Container,
    ContainerActionHandlers,
    FilterKey,
    Part,
    PartActionHandlers,
    SavedOptions,
    Task,
    TaskActionHandlers,
    Tossed,
} from './types';

const store = {
    get: (k: string, d: string): string => {
        try {
            return localStorage.getItem(k) ?? d;
        } catch {
            return d;
        }
    },
    set: (k: string, v: string): void => {
        try {
            localStorage.setItem(k, v);
        } catch {
            /* storage unavailable */
        }
    },
};

// Main sections: Home, Parts (Parts / Containers / Tossed), Tasks.
type ListView = 'home' | 'car' | 'parts' | 'containers' | 'tossed' | 'tasks';
type DetailView = 'part' | 'container' | 'task';
type View = ListView | DetailView;
type Section = 'home' | 'car' | 'parts' | 'tasks';
type Sub = 'parts' | 'containers' | 'tossed';
/** A list page, or a record's page with the id or key from the URL. */
type Route = { view: ListView; id?: undefined } | { view: DetailView; id: string };

const VIEWS: readonly ListView[] = ['home', 'car', 'parts', 'containers', 'tossed', 'tasks'];
const isListView = (v: string): v is ListView => VIEWS.some((x) => x === v);
const ALIASES: Record<string, ListView> = { todo: 'tasks', sale: 'parts', boxes: 'containers' };
const SECTION: Record<View, Section> = {
    home: 'home',
    car: 'car',
    parts: 'parts',
    part: 'parts',
    containers: 'parts',
    container: 'parts',
    tossed: 'parts',
    tasks: 'tasks',
    task: 'tasks',
};
const SUB: Partial<Record<View, Sub>> = {
    parts: 'parts',
    part: 'parts',
    containers: 'containers',
    container: 'containers',
    tossed: 'tossed',
};
/** URL prefixes of record pages; "box" is an old name for "container". */
const DETAIL: Record<string, DetailView> = { part: 'part', container: 'container', box: 'container', task: 'task' };

function parseHash(): Route {
    const h = decodeURIComponent(window.location.hash.slice(1));
    const m = /^(part|container|box|task)\/(.+)$/.exec(h);
    if (m) return { view: DETAIL[m[1]], id: m[2] };
    const v = ALIASES[h] || h;
    return { view: isListView(v) ? v : 'home' };
}

/** What the modal dialog is showing; record is set when editing an existing one. */
type ModalState =
    | { type: 'key' }
    | { type: 'part'; record?: Part }
    | { type: 'container'; record?: Container }
    | { type: 'tossed'; record?: Tossed }
    | { type: 'toss'; record: Part }
    | { type: 'task'; record?: Task };

interface KeyFormProps {
    onDone: () => void;
    onCancel: (() => void) | null;
    readsLocked: boolean;
}

function KeyForm({ onDone, onCancel, readsLocked }: KeyFormProps) {
    const [key, setKey] = useState<string>('');
    const [error, setError] = useState<string>('');
    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        keyStore.set(key.trim());
        try {
            const { ok } = await api.checkKey();
            if (!ok) throw new Error('That key is not right.');
            onDone();
        } catch (err) {
            keyStore.set('');
            setError(errorMessage(err));
        }
    };
    return (
        <form onSubmit={submit}>
            <h3 id="form-title">{readsLocked ? 'Access key' : 'Unlock editing'}</h3>
            <p className="mini" style={{ margin: 0 }}>
                {readsLocked
                    ? 'This app is private. Enter the access key to view it.'
                    : 'Enter the access key to add or change things.'}{' '}
                It's remembered in this browser.
            </p>
            <label>
                Key
                <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoFocus
                    autoComplete="current-password"
                    required
                />
            </label>
            {error && (
                <p className="err" role="alert">
                    {error}
                </p>
            )}
            <div className="formbtns">
                {onCancel && (
                    <button type="button" className="ibtn" title="Cancel" aria-label="Cancel" onClick={onCancel}>
                        <Icon.x />
                    </button>
                )}
                <button className="ibtn add" title="Unlock" aria-label="Unlock">
                    <Icon.unlock />
                </button>
            </div>
        </form>
    );
}

export default function App() {
    const [cfg, setCfg] = useState<AppConfig | null>(null);
    const [unlocked, setUnlocked] = useState<boolean>(false);
    const [parts, setParts] = useState<Part[]>([]);
    const [containers, setContainers] = useState<Container[]>([]);
    const [tossed, setTossed] = useState<Tossed[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loaded, setLoaded] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<string>('');
    const [route, setRoute] = useState<Route>(parseHash);
    const [layout, setLayout] = useState<Layout>(() => (store.get('layout', '') === 'table' ? 'table' : 'cards'));
    const [filters, setFilters] = useState<Set<FilterKey>>(
        () => new Set<FilterKey>(window.location.hash === '#sale' ? [`tag:${FOR_SALE}`] : []),
    );
    const [modal, setModal] = useState<ModalState | null>(null);
    const [toast, setToast] = useState<string>('');
    const toastTimer = useRef<ReturnType<typeof setTimeout>>();
    const listScroll = useRef<number>(0);

    const showToast = useCallback((msg: string, ms = 3000) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), ms);
    }, []);

    const canEdit = cfg !== null && (!cfg.keyRequiredForChanges || unlocked);
    const readsLocked = Boolean(cfg?.keyRequiredForReads) && !unlocked;

    const refresh = useCallback(async () => {
        try {
            const [p, c, x, t] = await Promise.all([
                api.parts.list(),
                api.containers.list(),
                api.tossed.list(),
                api.tasks.list(),
            ]);
            setParts(p);
            setContainers(c);
            setTossed(x);
            setTasks(t);
            setLoadError('');
        } catch (err) {
            if (!(err instanceof ApiError && err.status === 401)) setLoadError(errorMessage(err));
        } finally {
            setLoaded(true);
        }
    }, []);

    // Load config, check any saved key, then load data; refresh on a timer and on focus.
    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | undefined;
        (async () => {
            try {
                const c = await api.config();
                setCfg(c);
                if (c.keyRequiredForChanges && keyStore.get()) {
                    const { ok } = await api.checkKey().catch(() => ({ ok: false }));
                    if (ok) setUnlocked(true);
                    else keyStore.set('');
                }
            } catch (err) {
                setLoadError(errorMessage(err));
                setLoaded(true);
                return;
            }
            await refresh();
            timer = setInterval(() => document.visibilityState === 'visible' && refresh(), 30000);
        })();
        const onFocus = () => refresh();
        window.addEventListener('focus', onFocus);
        const onNeedKey = () => setModal((m) => m || { type: 'key' });
        authEvents.addEventListener('needkey', onNeedKey);
        // A write hit a 412 (someone else changed the record first): reload in place and say so.
        // Any open form stays open; it shows the same message and keeps what was typed.
        const onConflict = () => {
            showToast(CONFLICT_MESSAGE, 7000);
            refresh();
        };
        authEvents.addEventListener('conflict', onConflict);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            authEvents.removeEventListener('needkey', onNeedKey);
            authEvents.removeEventListener('conflict', onConflict);
        };
    }, [refresh, showToast]);

    // Hash routing: #home, #parts, #containers, #tossed, #tasks, #part/<key>, #container/<key>, #task/<id>.
    useEffect(() => {
        const onHash = () => {
            setRoute((prev) => {
                const next = parseHash();
                if (prev.view === 'parts' && next.view !== 'parts') listScroll.current = window.scrollY;
                return next;
            });
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);
    useEffect(() => {
        if (route.id) window.scrollTo(0, 0);
        else if (route.view === 'parts') requestAnimationFrame(() => window.scrollTo(0, listScroll.current));
        const titles: Partial<Record<View, string>> = {
            part: findRef(parts, route.id)?.label,
            container: findRef(containers, route.id)?.name,
            task: findRef(tasks, route.id)?.title,
            car: 'The Car',
        };
        document.title = titles[route.view] ? `${titles[route.view]} · RSX Type-S Project` : 'RSX Type-S Project';
    }, [route, parts, containers, tasks]);
    useEffect(() => {
        store.set('layout', layout);
    }, [layout]);

    const go = (view: ListView) => {
        window.location.hash = `#${view}`;
    };
    // Clicking any tag shows only parts with that tag.
    const onTag = useCallback((key: FilterKey) => {
        setFilters(new Set([key]));
        listScroll.current = 0;
        if (window.location.hash !== '#parts') window.location.hash = '#parts';
        else window.scrollTo(0, 0);
    }, []);

    // Put a record returned by a write into state right away, so the next write sends its new version.
    const replaceIn =
        <T extends { id: string }>(setList: Dispatch<SetStateAction<T[]>>) =>
        (rec: T) =>
            setList((list) => list.map((x) => (x.id === rec.id ? rec : x)));
    const replacePart = replaceIn(setParts);
    const replaceContainer = replaceIn(setContainers);
    const replaceTossed = replaceIn(setTossed);
    const replaceTask = replaceIn(setTasks);
    // Step saves: the latest tasks (for versions), the checks not yet saved, and each task's save queue.
    const tasksRef = useRef<Task[]>(tasks);
    tasksRef.current = tasks;
    const pendingSteps = useRef<Record<string, Record<number, boolean>>>({});
    const stepSaves = useRef<Record<string, Promise<unknown>>>({});

    const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
        try {
            await fn();
            if (okMsg) showToast(okMsg);
        } catch (err) {
            // A 412 has already been reported and reloaded by the "conflict" listener.
            if (!(err instanceof PreconditionFailedError)) showToast(errorMessage(err));
        }
        refresh();
    };

    const close = () => setModal(null);
    const saved =
        <T extends { id: string }>(msg: string, replace: (rec: T) => void) =>
        (rec: T, opts?: SavedOptions) => {
            replace(rec);
            if (!opts?.keepOpen) {
                close();
                showToast(msg);
            }
            refresh();
        };
    const tagOptions = [...new Set(parts.flatMap((p) => p.tags || []))];
    const openTasks = tasks.filter((t) => !t.done).length;
    const topCount = topContainers(containers).length;

    const partActs: PartActionHandlers = {
        onEdit: (p) => setModal({ type: 'part', record: p }),
        onToggleSale: (p) =>
            run(
                () =>
                    api.parts
                        .update(p, {
                            tags: isForSale(p)
                                ? p.tags.filter((t) => t !== FOR_SALE)
                                : [...p.tags.filter((t) => t !== 'Potential sale'), FOR_SALE],
                        })
                        .then(replacePart),
                isForSale(p) ? `Took "${p.label}" off sale.` : `Marked "${p.label}" for sale.`,
            ),
        onToss: (p) => setModal({ type: 'toss', record: p }),
        onDelete: (p) =>
            run(
                () =>
                    api.parts.remove(p).then(() => {
                        if (route.view === 'part') go('parts');
                    }),
                `Deleted "${p.label}".`,
            ),
    };
    const boxActs: ContainerActionHandlers = {
        onEdit: (c) => setModal({ type: 'container', record: c }),
        onDelete: (c) =>
            run(
                () =>
                    api.containers.remove(c).then(() => {
                        if (!c.parentId && route.view === 'container') go('containers');
                    }),
                `Removed "${c.name}".`,
            ),
    };
    const taskActs: TaskActionHandlers = {
        onToggle: (t, done) => {
            setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done } : x)));
            run(() => api.tasks.update(t, { done }).then(replaceTask));
        },
        onStep: (t, index, done) => {
            // Show the tick right away; saves for one task go out one at a time, each from the latest
            // version, so quick clicks don't trip over each other's If-Match.
            pendingSteps.current[t.id] = { ...pendingSteps.current[t.id], [index]: done };
            const apply = (x: Task): Task => {
                const want = pendingSteps.current[x.id] || {};
                const steps = x.steps.map((s, i) => (i in want ? { ...s, done: want[i] } : s));
                return { ...x, steps, done: steps.every((s) => s.done) };
            };
            setTasks((ts) => ts.map((x) => (x.id === t.id ? apply(x) : x)));
            const prev = stepSaves.current[t.id] || Promise.resolve();
            stepSaves.current[t.id] = prev.then(() =>
                run(async () => {
                    const latest = tasksRef.current.find((x) => x.id === t.id);
                    if (!latest) return;
                    const want = pendingSteps.current[t.id] || {};
                    const steps = latest.steps.map((s, i) => (i in want ? { ...s, done: want[i] } : s));
                    const saved = await api.tasks.update(latest, { steps });
                    delete pendingSteps.current[t.id];
                    tasksRef.current = tasksRef.current.map((x) => (x.id === saved.id ? saved : x));
                    replaceTask(saved);
                }),
            );
        },
        onEdit: (task) => setModal({ type: 'task', record: task }),
        onDelete: (t) =>
            run(
                () =>
                    api.tasks.remove(t).then(() => {
                        if (route.view === 'task') go('tasks');
                    }),
                `Deleted "${t.title}".`,
            ),
    };

    const section = SECTION[route.view] || 'home';
    const sub = SUB[route.view];

    let page: ReactNode;
    if (readsLocked) {
        page = (
            <div className="empty">
                This app is private.{' '}
                <button className="btn" onClick={() => setModal({ type: 'key' })}>
                    Enter access key
                </button>
            </div>
        );
    } else if (!loaded) {
        page = <div className="empty">Loading…</div>;
    } else if (route.view === 'home') {
        page = <Home parts={parts} containers={containers} tasks={tasks} />;
    } else if (route.view === 'car') {
        page = <CarView tasks={tasks} />;
    } else if (route.view === 'parts') {
        page = (
            <PartsView
                parts={parts}
                layout={layout}
                canEdit={canEdit}
                filters={filters}
                setFilters={setFilters}
                onAdd={() => setModal({ type: 'part' })}
                {...partActs}
            />
        );
    } else if (route.view === 'part') {
        page = <PartDetail part={findRef(parts, route.id)} loaded={loaded} canEdit={canEdit} {...partActs} />;
    } else if (route.view === 'containers') {
        page = (
            <ContainersView
                containers={containers}
                parts={parts}
                canEdit={canEdit}
                onAdd={() => setModal({ type: 'container' })}
                {...boxActs}
            />
        );
    } else if (route.view === 'container') {
        let box = findRef(containers, route.id);
        const parentId = box?.parentId;
        if (parentId) box = containers.find((b) => b.id === parentId) || box;
        page = (
            <ContainerDetail
                box={box}
                boxes={containers}
                parts={parts}
                loaded={loaded}
                canEdit={canEdit}
                {...boxActs}
            />
        );
    } else if (route.view === 'tossed') {
        page = (
            <TossedView
                tossed={tossed}
                canEdit={canEdit}
                onAdd={() => setModal({ type: 'tossed' })}
                onEdit={(x) => setModal({ type: 'tossed', record: x })}
                onDelete={(x) => run(() => api.tossed.remove(x), `Deleted the record for "${x.label}".`)}
            />
        );
    } else if (route.view === 'tasks') {
        page = <TasksView tasks={tasks} canEdit={canEdit} onAdd={() => setModal({ type: 'task' })} {...taskActs} />;
    } else {
        page = (
            <TaskDetail task={findRef(tasks, route.id)} parts={parts} loaded={loaded} canEdit={canEdit} {...taskActs} />
        );
    }

    return (
        <TagFilter.Provider value={onTag}>
            <div className="wrap">
                <header>
                    <div>
                        <a className="brand" href="#home" aria-label="RSX Type-S Project, home">
                            <img src="/icon.jpg" alt="" />
                            <h1>RSX Type-S Project</h1>
                        </a>
                        <p className="sub">2002 Acura RSX Type-S: the car, its parts, and the tasks</p>
                    </div>
                    <div className="hdrtools">
                        {cfg?.keyRequiredForChanges &&
                            (unlocked ? (
                                <button
                                    className="chip lockbtn"
                                    title="Lock editing in this browser"
                                    aria-label="Lock editing"
                                    onClick={() => {
                                        keyStore.set('');
                                        setUnlocked(false);
                                    }}
                                >
                                    <Icon.unlock />
                                </button>
                            ) : (
                                <button
                                    className="chip lockbtn"
                                    title="Unlock editing"
                                    aria-label="Unlock editing"
                                    onClick={() => setModal({ type: 'key' })}
                                >
                                    <Icon.lock />
                                </button>
                            ))}
                        <ThemeToggle />
                    </div>
                </header>

                <nav className="tabs" role="tablist">
                    <button role="tab" aria-selected={section === 'home'} onClick={() => go('home')}>
                        Home
                    </button>
                    <button role="tab" aria-selected={section === 'car'} onClick={() => go('car')}>
                        The Car
                    </button>
                    <button role="tab" aria-selected={section === 'parts'} onClick={() => go('parts')}>
                        Parts
                    </button>
                    <button role="tab" aria-selected={section === 'tasks'} onClick={() => go('tasks')}>
                        Tasks{openTasks ? ` (${openTasks})` : ''}
                    </button>
                </nav>
                {section === 'parts' && (
                    <nav className="subtabs" role="tablist" aria-label="Parts sections">
                        <button role="tab" aria-selected={sub === 'parts'} onClick={() => go('parts')}>
                            Parts
                        </button>
                        <button role="tab" aria-selected={sub === 'containers'} onClick={() => go('containers')}>
                            Containers{topCount ? ` (${topCount})` : ''}
                        </button>
                        <button role="tab" aria-selected={sub === 'tossed'} onClick={() => go('tossed')}>
                            Tossed{tossed.length ? ` (${tossed.length})` : ''}
                        </button>
                        <span className="spacer" />
                        {route.view === 'parts' && (
                            <div className="seg" role="group" aria-label="Layout">
                                <button
                                    aria-pressed={layout === 'cards'}
                                    aria-label="Card layout"
                                    title="Cards"
                                    onClick={() => setLayout('cards')}
                                >
                                    <Icon.cards />
                                </button>
                                <button
                                    aria-pressed={layout === 'table'}
                                    aria-label="Table layout"
                                    title="Table"
                                    onClick={() => setLayout('table')}
                                >
                                    <Icon.table />
                                </button>
                            </div>
                        )}
                    </nav>
                )}

                {loadError && (
                    <div className="banner" role="alert">
                        {loadError}{' '}
                        <button className="ibtn" title="Try again" aria-label="Try again" onClick={refresh}>
                            <Icon.forward />
                        </button>
                    </div>
                )}

                {page}

                <Modal open={!!modal} onClose={close} labelledBy="form-title">
                    {modal?.type === 'key' && (
                        <KeyForm
                            readsLocked={Boolean(cfg?.keyRequiredForReads)}
                            onCancel={cfg?.keyRequiredForReads ? null : close}
                            onDone={() => {
                                setUnlocked(true);
                                close();
                                showToast('Unlocked.');
                                refresh();
                            }}
                        />
                    )}
                    {modal?.type === 'part' && (
                        <PartForm
                            part={modal.record}
                            containers={containers}
                            tagOptions={tagOptions}
                            onCancel={close}
                            onSaved={saved(modal.record ? 'Saved.' : 'Part added.', replacePart)}
                        />
                    )}
                    {modal?.type === 'container' && (
                        <ContainerForm
                            container={modal.record}
                            containers={containers}
                            onCancel={close}
                            onSaved={saved(modal.record ? 'Saved.' : 'Container added.', replaceContainer)}
                        />
                    )}
                    {modal?.type === 'tossed' && (
                        <TossedForm
                            item={modal.record}
                            onCancel={close}
                            onSaved={saved(modal.record ? 'Saved.' : 'Logged.', replaceTossed)}
                        />
                    )}
                    {modal?.type === 'toss' && (
                        <TossPartForm
                            part={modal.record}
                            onCancel={close}
                            onDone={() => {
                                close();
                                showToast(`Moved "${modal.record.label}" to Tossed.`);
                                if (route.view === 'part') go('parts');
                                refresh();
                            }}
                        />
                    )}
                    {modal?.type === 'task' && (
                        <TaskForm
                            task={modal.record}
                            parts={parts}
                            onCancel={close}
                            onSaved={saved('Saved.', replaceTask)}
                        />
                    )}
                </Modal>

                {toast && (
                    <div className="toast" role="status">
                        {toast}
                    </div>
                )}
            </div>
        </TagFilter.Provider>
    );
}
