import { useEffect, useRef, useState } from 'react';
import type { CarPhoto } from '../car';
import { Icon } from './Icons';

interface CarStripProps {
    title: string;
    photos: CarPhoto[];
    onOpen: (index: number) => void;
}

const GAP = 10;

// One Car tab section. On phones it's a row of full-width photos to swipe, with arrows and a
// "n / total" count over the photo; from 720px it's a grid of four thumbnails per row (CSS only).
export default function CarStrip({ title, photos, onOpen }: CarStripProps) {
    const row = useRef<HTMLDivElement>(null);
    const [i, setI] = useState<number>(0);
    const n = photos.length;
    useEffect(() => {
        const el = row.current;
        if (!el) return;
        const sync = () => setI(Math.round(el.scrollLeft / Math.max(el.clientWidth + GAP, 1)));
        el.addEventListener('scroll', sync, { passive: true });
        window.addEventListener('resize', sync);
        return () => {
            el.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
        };
    }, []);
    const go = (to: number) => {
        const el = row.current;
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ left: to * (el.clientWidth + GAP), behavior: reduce ? 'auto' : 'smooth' });
    };
    return (
        <div className="carwrap">
            <div className="cargrid" ref={row}>
                {photos.map((p, j) => (
                    <figure className="cfig" key={p.src}>
                        <button
                            className="cthumb"
                            aria-label={`Open ${title} photo ${j + 1} of ${n}: ${p.caption}`}
                            onClick={() => onOpen(j)}
                        >
                            <img src={p.thumb} alt="" loading="lazy" draggable="false" />
                        </button>
                        <figcaption>{p.caption}</figcaption>
                    </figure>
                ))}
            </div>
            {n > 1 && (
                <div className="cnav">
                    <button disabled={i <= 0} aria-label={`Previous ${title} photo`} onClick={() => go(i - 1)}>
                        <Icon.prev />
                    </button>
                    <span className="ccount" aria-live="polite">
                        {i + 1} / {n}
                    </span>
                    <button disabled={i >= n - 1} aria-label={`Next ${title} photo`} onClick={() => go(i + 1)}>
                        <Icon.next />
                    </button>
                </div>
            )}
        </div>
    );
}
