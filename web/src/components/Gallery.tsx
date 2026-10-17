import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icons';
import PhotoViewer from './PhotoViewer';
import type { Photo } from '../types';

interface GalleryProps {
    photos: Photo[];
    label: string;
    /** Tapping a photo opens it full screen (used on part and container pages). */
    zoom?: boolean;
}

// Swipeable photo strip using native scroll-snap: touch swipe, trackpad, arrow
// buttons (on hover), dots, and arrow keys all work. Shows a count badge when
// there is more than one photo.
export default function Gallery({ photos, label, zoom }: GalleryProps) {
    const strip = useRef<HTMLDivElement>(null);
    const [index, setIndex] = useState<number>(0);
    const [viewing, setViewing] = useState<number | null>(null);
    const viewer =
        viewing !== null ? (
            <PhotoViewer
                photos={photos.map((p) => p.url)}
                index={viewing}
                label={label}
                onClose={() => setViewing(null)}
            />
        ) : null;
    const zoomProps = (j: number) => (zoom ? { onClick: () => setViewing(j), className: 'zoomable' } : {});
    const n = photos.length;

    useEffect(() => {
        if (index > n - 1) setIndex(Math.max(0, n - 1));
    }, [n, index]);

    if (!n) {
        return (
            <div className="photos">
                <div className="noimg">No photo</div>
            </div>
        );
    }
    if (n === 1) {
        return (
            <div className="photos">
                <img src={photos[0].url} alt={label} loading="lazy" draggable="false" {...zoomProps(0)} />
                {viewer}
            </div>
        );
    }

    const goTo = (i: number) => {
        const s = strip.current;
        if (!s) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        s.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * s.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    };
    const onScroll = () => {
        const s = strip.current;
        if (!s) return;
        const i = Math.round(s.scrollLeft / Math.max(s.clientWidth, 1));
        if (i !== index) setIndex(i);
    };
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            goTo(index + (e.key === 'ArrowRight' ? 1 : -1));
        }
    };

    return (
        <div className="photos">
            <div
                className="strip"
                ref={strip}
                onScroll={onScroll}
                onKeyDown={onKey}
                tabIndex={0}
                aria-label={`${label} photos, swipe for more`}
            >
                {photos.map((p, j) => (
                    <img
                        key={p.id}
                        src={p.url}
                        alt={`${label} (photo ${j + 1} of ${n})`}
                        loading="lazy"
                        draggable="false"
                        {...zoomProps(j)}
                    />
                ))}
            </div>
            <span className="count">
                <Icon.photos />
                <span>
                    {index + 1}/{n}
                </span>
            </span>
            <button
                className="navb prev"
                aria-label="Previous photo"
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
            >
                <Icon.prev />
            </button>
            <button
                className="navb next"
                aria-label="Next photo"
                disabled={index === n - 1}
                onClick={() => goTo(index + 1)}
            >
                <Icon.next />
            </button>
            <div className="dots">
                {photos.map((p, j) => (
                    <button
                        key={p.id}
                        aria-label={`Show photo ${j + 1}`}
                        aria-current={j === index}
                        onClick={() => goTo(j)}
                    />
                ))}
            </div>
            {viewer}
        </div>
    );
}

export function Thumb({ photos, label }: GalleryProps) {
    const p = photos[0];
    return (
        <span className="thumb">
            {p && <img src={p.thumbUrl} alt={label} loading="lazy" />}
            {photos.length > 1 && <span className="n">{photos.length}</span>}
        </span>
    );
}
