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
    const [current, setCurrent] = useState<number>(0);
    const count = photos.length;
    useEffect(() => {
        const el = row.current;
        if (!el) return;
        const sync = () => setCurrent(Math.round(el.scrollLeft / Math.max(el.clientWidth + GAP, 1)));
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
                {photos.map((photo, index) => (
                    <figure className="cfig" key={photo.src}>
                        <button
                            className="cthumb"
                            aria-label={`Open ${title} photo ${index + 1} of ${count}: ${photo.caption}`}
                            onClick={() => onOpen(index)}
                        >
                            <img src={photo.thumb} alt="" loading="lazy" draggable="false" />
                        </button>
                        <figcaption>{photo.caption}</figcaption>
                    </figure>
                ))}
            </div>
            {count > 1 && (
                <div className="cnav">
                    <button
                        disabled={current <= 0}
                        aria-label={`Previous ${title} photo`}
                        onClick={() => go(current - 1)}
                    >
                        <Icon.prev />
                    </button>
                    <span className="ccount" aria-live="polite">
                        {current + 1} / {count}
                    </span>
                    <button
                        disabled={current >= count - 1}
                        aria-label={`Next ${title} photo`}
                        onClick={() => go(current + 1)}
                    >
                        <Icon.next />
                    </button>
                </div>
            )}
        </div>
    );
}
