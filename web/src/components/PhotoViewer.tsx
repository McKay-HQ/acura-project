import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

interface PhotoViewerProps {
    photos: string[];
    index: number;
    label: string;
    /** One per photo, shown under it. */
    captions?: string[];
    onClose: () => void;
}

const MAX_ZOOM = 5;
const TAP_ZOOM = 2.5;

// Full-screen photo viewer. Swiping between photos is native scroll-snap. Zoom is a CSS transform on
// the current photo: pinch or double-tap on touch screens, click and drag with a mouse.
export default function PhotoViewer({ photos, index, label, captions, onClose }: PhotoViewerProps) {
    const strip = useRef<HTMLDivElement>(null);
    const closeBtn = useRef<HTMLButtonElement>(null);
    const [current, setCurrent] = useState<number>(index);
    const [zoomed, setZoomed] = useState<boolean>(false);
    // Zoom state lives in a ref so gesture handlers don't re-render on every move.
    const zoom = useRef({ s: 1, x: 0, y: 0, i: index });
    const count = photos.length;

    // The helpers below only read refs (and a state setter), so they're stable for the viewer's lifetime;
    // `go` changes only when the number of photos does.
    const img = useCallback(
        () => strip.current?.children[zoom.current.i]?.firstElementChild as HTMLImageElement | undefined,
        [],
    );
    const apply = useCallback(() => {
        const { s, x, y } = zoom.current;
        const im = img();
        if (im) im.style.transform = s > 1 ? `translate(${x}px,${y}px) scale(${s})` : '';
        setZoomed(s > 1);
    }, [img]);
    const clamp = useCallback(() => {
        const el = strip.current;
        if (!el) return;
        const state = zoom.current;
        const mx = ((state.s - 1) * el.clientWidth) / 2;
        const my = ((state.s - 1) * el.clientHeight) / 2;
        state.x = Math.max(-mx, Math.min(mx, state.x));
        state.y = Math.max(-my, Math.min(my, state.y));
    }, []);
    const reset = useCallback(() => {
        const im = img();
        if (im) im.style.transform = '';
        Object.assign(zoom.current, { s: 1, x: 0, y: 0 });
        setZoomed(false);
    }, [img]);
    /** Zoom to scale s, keeping the point (fx, fy) (relative to the photo's center) in place. */
    const zoomAt = useCallback(
        (scale: number, fx: number, fy: number, s0 = zoom.current.s, x0 = zoom.current.x, y0 = zoom.current.y) => {
            const state = zoom.current;
            scale = Math.max(1, Math.min(MAX_ZOOM, scale));
            state.x = fx - ((fx - x0) * scale) / s0;
            state.y = fy - ((fy - y0) * scale) / s0;
            state.s = scale;
            if (scale === 1) state.x = state.y = 0;
            clamp();
            apply();
        },
        [apply, clamp],
    );
    const rel = useCallback((cx: number, cy: number): [number, number] => {
        const rect = strip.current!.getBoundingClientRect();
        return [cx - rect.left - rect.width / 2, cy - rect.top - rect.height / 2];
    }, []);
    const go = useCallback(
        (to: number) => {
            const el = strip.current;
            if (!el || to < 0 || to >= count) return;
            reset();
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            el.scrollTo({ left: to * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
        },
        [count, reset],
    );

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
            if (to !== zoom.current.i && to >= 0 && to < count) {
                reset();
                zoom.current.i = to;
                setCurrent(to);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            } else if (event.key === 'ArrowLeft') go(zoom.current.i - 1);
            else if (event.key === 'ArrowRight') go(zoom.current.i + 1);
        };
        const onResize = () => {
            reset();
            el.scrollLeft = zoom.current.i * el.clientWidth;
        };

        // Touch: pinch to zoom, drag to pan while zoomed, double-tap to toggle. At 1x a swipe scrolls natively.
        type Gesture =
            | { kind: 'pinch'; d: number; s: number; x: number; y: number; mx: number; my: number }
            | { kind: 'pan'; cx: number; cy: number; x: number; y: number };
        let gesture: Gesture | null = null;
        let lastTap = 0;
        let lastTouch = 0;
        const dist = (first: Touch, second: Touch) =>
            Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
        const mid = (touches: TouchList) =>
            rel((touches[0].clientX + touches[1].clientX) / 2, (touches[0].clientY + touches[1].clientY) / 2);
        const panFrom = (touch: Touch): Gesture => ({
            kind: 'pan',
            cx: touch.clientX,
            cy: touch.clientY,
            x: zoom.current.x,
            y: zoom.current.y,
        });
        const onTouchStart = (event: TouchEvent) => {
            const touches = event.touches;
            lastTouch = Date.now();
            if (touches.length === 2) {
                const [mx, my] = mid(touches);
                gesture = {
                    kind: 'pinch',
                    d: dist(touches[0], touches[1]),
                    s: zoom.current.s,
                    x: zoom.current.x,
                    y: zoom.current.y,
                    mx,
                    my,
                };
            } else if (touches.length === 1) {
                const now = Date.now();
                if (now - lastTap < 300) {
                    event.preventDefault();
                    lastTap = 0;
                    gesture = null;
                    const [fx, fy] = rel(touches[0].clientX, touches[0].clientY);
                    if (zoom.current.s > 1) reset();
                    else zoomAt(TAP_ZOOM, fx, fy);
                    return;
                }
                lastTap = now;
                gesture = zoom.current.s > 1 ? panFrom(touches[0]) : null;
            }
        };
        const onTouchMove = (event: TouchEvent) => {
            const touches = event.touches;
            if (gesture?.kind === 'pinch' && touches.length === 2) {
                event.preventDefault();
                const [mx, my] = mid(touches);
                zoomAt(
                    (gesture.s * dist(touches[0], touches[1])) / gesture.d,
                    gesture.mx,
                    gesture.my,
                    gesture.s,
                    gesture.x + (mx - gesture.mx),
                    gesture.y + (my - gesture.my),
                );
            } else if (gesture?.kind === 'pan' && touches.length === 1) {
                event.preventDefault();
                zoom.current.x = gesture.x + touches[0].clientX - gesture.cx;
                zoom.current.y = gesture.y + touches[0].clientY - gesture.cy;
                clamp();
                apply();
            }
        };
        const onTouchEnd = (event: TouchEvent) => {
            if (event.touches.length === 0) {
                gesture = null;
                if (zoom.current.s < 1.05) reset();
            } else if (event.touches.length === 1 && zoom.current.s > 1) gesture = panFrom(event.touches[0]);
        };

        // Mouse: click zooms in at the pointer (or back out), drag pans while zoomed. Mouse events that
        // browsers synthesize right after a touch are ignored.
        let md: { cx: number; cy: number; x: number; y: number; moved: boolean } | null = null;
        const onMouseDown = (event: MouseEvent) => {
            if (event.button !== 0 || (event.target as HTMLElement).tagName !== 'IMG' || Date.now() - lastTouch < 800)
                return;
            event.preventDefault();
            md = { cx: event.clientX, cy: event.clientY, x: zoom.current.x, y: zoom.current.y, moved: false };
        };
        const onMouseMove = (event: MouseEvent) => {
            if (!md || zoom.current.s === 1) return;
            const dx = event.clientX - md.cx;
            const dy = event.clientY - md.cy;
            if (Math.abs(dx) + Math.abs(dy) > 4) md.moved = true;
            zoom.current.x = md.x + dx;
            zoom.current.y = md.y + dy;
            clamp();
            apply();
        };
        const onMouseUp = (event: MouseEvent) => {
            const down = md;
            md = null;
            if (!down || down.moved) return;
            const target = event.target as HTMLElement;
            if (target.tagName !== 'IMG' || !el.contains(target)) return;
            if (zoom.current.s > 1) reset();
            else {
                const [fx, fy] = rel(event.clientX, event.clientY);
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
        // The handlers only read refs and the stable helpers above, so they're attached once per open viewer.
    }, [count, onClose, apply, clamp, go, reset, rel, zoomAt]);

    return (
        <div className={zoomed ? 'viewer zoomed' : 'viewer'} role="dialog" aria-modal="true" aria-label="Photo viewer">
            <div className="vtop">
                <span aria-live="polite">
                    {label} · {current + 1} of {count}
                </span>
                <button ref={closeBtn} aria-label="Close" onClick={onClose}>
                    <Icon.x />
                </button>
            </div>
            <div className="vstrip" ref={strip}>
                {photos.map((src, photoIndex) => (
                    <div className="vslide" key={src}>
                        <img src={src} alt={`${label}, photo ${photoIndex + 1} of ${count}`} draggable="false" />
                    </div>
                ))}
            </div>
            {captions?.[current] && (
                <div className="vcap" aria-live="polite">
                    {captions[current]}
                </div>
            )}
            <div className="vhint">Swipe for more · pinch or double-tap to zoom</div>
            <button
                className="vnav prev"
                aria-label="Previous photo"
                disabled={current === 0}
                onClick={() => go(current - 1)}
            >
                <Icon.prev />
            </button>
            <button
                className="vnav next"
                aria-label="Next photo"
                disabled={current === count - 1}
                onClick={() => go(current + 1)}
            >
                <Icon.next />
            </button>
        </div>
    );
}
