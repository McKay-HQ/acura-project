import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

interface PhotoViewerProps {
    photos: string[];
    index: number;
    label: string;
    onClose: () => void;
}

const MAX_ZOOM = 5;
const TAP_ZOOM = 2.5;

// Full-screen photo viewer. Swiping between photos is native scroll-snap. Zoom is a CSS transform on
// the current photo: pinch or double-tap on touch screens, click and drag with a mouse.
export default function PhotoViewer({ photos, index, label, onClose }: PhotoViewerProps) {
    const strip = useRef<HTMLDivElement>(null);
    const closeBtn = useRef<HTMLButtonElement>(null);
    const [i, setI] = useState<number>(index);
    const [zoomed, setZoomed] = useState<boolean>(false);
    // Zoom state lives in a ref so gesture handlers don't re-render on every move.
    const z = useRef({ s: 1, x: 0, y: 0, i: index });
    const n = photos.length;

    const img = () => strip.current?.children[z.current.i]?.firstElementChild as HTMLImageElement | undefined;
    const apply = () => {
        const { s, x, y } = z.current;
        const im = img();
        if (im) im.style.transform = s > 1 ? `translate(${x}px,${y}px) scale(${s})` : '';
        setZoomed(s > 1);
    };
    const clamp = () => {
        const el = strip.current;
        if (!el) return;
        const c = z.current;
        const mx = ((c.s - 1) * el.clientWidth) / 2;
        const my = ((c.s - 1) * el.clientHeight) / 2;
        c.x = Math.max(-mx, Math.min(mx, c.x));
        c.y = Math.max(-my, Math.min(my, c.y));
    };
    const reset = () => {
        const im = img();
        if (im) im.style.transform = '';
        Object.assign(z.current, { s: 1, x: 0, y: 0 });
        setZoomed(false);
    };
    /** Zoom to scale s, keeping the point (fx, fy) (relative to the photo's center) in place. */
    const zoomAt = (s: number, fx: number, fy: number, s0 = z.current.s, x0 = z.current.x, y0 = z.current.y) => {
        const c = z.current;
        s = Math.max(1, Math.min(MAX_ZOOM, s));
        c.x = fx - ((fx - x0) * s) / s0;
        c.y = fy - ((fy - y0) * s) / s0;
        c.s = s;
        if (s === 1) c.x = c.y = 0;
        clamp();
        apply();
    };
    const rel = (cx: number, cy: number): [number, number] => {
        const r = strip.current!.getBoundingClientRect();
        return [cx - r.left - r.width / 2, cy - r.top - r.height / 2];
    };
    const go = (to: number) => {
        const el = strip.current;
        if (!el || to < 0 || to >= n) return;
        reset();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ left: to * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    };

    // Open on the chosen photo, lock page scrolling, and give focus back on close.
    useLayoutEffect(() => {
        const el = strip.current;
        if (el) el.scrollLeft = index * el.clientWidth;
        const back = document.activeElement as HTMLElement | null;
        const root = document.documentElement;
        const prev = root.style.overflow;
        root.style.overflow = 'hidden';
        closeBtn.current?.focus();
        return () => {
            root.style.overflow = prev;
            back?.focus();
        };
    }, [index]);

    useEffect(() => {
        const el = strip.current;
        if (!el) return;
        const onScroll = () => {
            const to = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
            if (to !== z.current.i && to >= 0 && to < n) {
                reset();
                z.current.i = to;
                setI(to);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'ArrowLeft') go(z.current.i - 1);
            else if (e.key === 'ArrowRight') go(z.current.i + 1);
        };
        const onResize = () => {
            reset();
            el.scrollLeft = z.current.i * el.clientWidth;
        };

        // Touch: pinch to zoom, drag to pan while zoomed, double-tap to toggle. At 1x a swipe scrolls natively.
        type Gesture =
            | { kind: 'pinch'; d: number; s: number; x: number; y: number; mx: number; my: number }
            | { kind: 'pan'; cx: number; cy: number; x: number; y: number };
        let g: Gesture | null = null;
        let lastTap = 0;
        let lastTouch = 0;
        const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const mid = (t: TouchList) => rel((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
        const panFrom = (t: Touch): Gesture => ({
            kind: 'pan',
            cx: t.clientX,
            cy: t.clientY,
            x: z.current.x,
            y: z.current.y,
        });
        const onTouchStart = (e: TouchEvent) => {
            const t = e.touches;
            lastTouch = Date.now();
            if (t.length === 2) {
                const [mx, my] = mid(t);
                g = { kind: 'pinch', d: dist(t[0], t[1]), s: z.current.s, x: z.current.x, y: z.current.y, mx, my };
            } else if (t.length === 1) {
                const now = Date.now();
                if (now - lastTap < 300) {
                    e.preventDefault();
                    lastTap = 0;
                    g = null;
                    const [fx, fy] = rel(t[0].clientX, t[0].clientY);
                    if (z.current.s > 1) reset();
                    else zoomAt(TAP_ZOOM, fx, fy);
                    return;
                }
                lastTap = now;
                g = z.current.s > 1 ? panFrom(t[0]) : null;
            }
        };
        const onTouchMove = (e: TouchEvent) => {
            const t = e.touches;
            if (g?.kind === 'pinch' && t.length === 2) {
                e.preventDefault();
                const [mx, my] = mid(t);
                zoomAt((g.s * dist(t[0], t[1])) / g.d, g.mx, g.my, g.s, g.x + (mx - g.mx), g.y + (my - g.my));
            } else if (g?.kind === 'pan' && t.length === 1) {
                e.preventDefault();
                z.current.x = g.x + t[0].clientX - g.cx;
                z.current.y = g.y + t[0].clientY - g.cy;
                clamp();
                apply();
            }
        };
        const onTouchEnd = (e: TouchEvent) => {
            if (e.touches.length === 0) {
                g = null;
                if (z.current.s < 1.05) reset();
            } else if (e.touches.length === 1 && z.current.s > 1) g = panFrom(e.touches[0]);
        };

        // Mouse: click zooms in at the pointer (or back out), drag pans while zoomed. Mouse events that
        // browsers synthesize right after a touch are ignored.
        let md: { cx: number; cy: number; x: number; y: number; moved: boolean } | null = null;
        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0 || (e.target as HTMLElement).tagName !== 'IMG' || Date.now() - lastTouch < 800) return;
            e.preventDefault();
            md = { cx: e.clientX, cy: e.clientY, x: z.current.x, y: z.current.y, moved: false };
        };
        const onMouseMove = (e: MouseEvent) => {
            if (!md || z.current.s === 1) return;
            const dx = e.clientX - md.cx;
            const dy = e.clientY - md.cy;
            if (Math.abs(dx) + Math.abs(dy) > 4) md.moved = true;
            z.current.x = md.x + dx;
            z.current.y = md.y + dy;
            clamp();
            apply();
        };
        const onMouseUp = (e: MouseEvent) => {
            const m = md;
            md = null;
            if (!m || m.moved) return;
            const t = e.target as HTMLElement;
            if (t.tagName !== 'IMG' || !el.contains(t)) return;
            if (z.current.s > 1) reset();
            else {
                const [fx, fy] = rel(e.clientX, e.clientY);
                zoomAt(TAP_ZOOM, fx, fy);
            }
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        el.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        return () => {
            el.removeEventListener('scroll', onScroll);
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onResize);
        };
        // The handlers only read refs, so they're attached once per open viewer.
    }, [n, onClose]);

    return (
        <div className={zoomed ? 'viewer zoomed' : 'viewer'} role="dialog" aria-modal="true" aria-label="Photo viewer">
            <div className="vtop">
                <span aria-live="polite">
                    {label} · {i + 1} of {n}
                </span>
                <button ref={closeBtn} aria-label="Close" onClick={onClose}>
                    <Icon.x />
                </button>
            </div>
            <div className="vstrip" ref={strip}>
                {photos.map((src, j) => (
                    <div className="vslide" key={src}>
                        <img src={src} alt={`${label}, photo ${j + 1} of ${n}`} draggable="false" />
                    </div>
                ))}
            </div>
            <div className="vhint">Swipe for more · pinch or double-tap to zoom</div>
            <button className="vnav prev" aria-label="Previous photo" disabled={i === 0} onClick={() => go(i - 1)}>
                <Icon.prev />
            </button>
            <button className="vnav next" aria-label="Next photo" disabled={i === n - 1} onClick={() => go(i + 1)}>
                <Icon.next />
            </button>
        </div>
    );
}
