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
                photos={photos.map((photo) => photo.url)}
                index={viewing}
                label={label}
                onClose={() => setViewing(null)}
            />
        ) : null;
    const zoomProps = (photoIndex: number) =>
        zoom ? { onClick: () => setViewing(photoIndex), className: 'zoomable' } : {};
    const count = photos.length;

    useEffect(() => {
        if (index > count - 1) setIndex(Math.max(0, count - 1));
    }, [count, index]);

    if (!count) {
        return (
            <div className="photos">
                <div className="noimg">No photo</div>
            </div>
        );
    }
    if (count === 1) {
        return (
            <div className="photos">
                <img src={photos[0].url} alt={label} loading="lazy" draggable="false" {...zoomProps(0)} />
                {viewer}
            </div>
        );
    }

    const goTo = (target: number) => {
        const el = strip.current;
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({
            left: Math.max(0, Math.min(count - 1, target)) * el.clientWidth,
            behavior: reduce ? 'auto' : 'smooth',
        });
    };
    const onScroll = () => {
        const el = strip.current;
        if (!el) return;
        const current = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
        if (current !== index) setIndex(current);
    };
    const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            goTo(index + (event.key === 'ArrowRight' ? 1 : -1));
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
                {photos.map((photo, photoIndex) => (
                    <img
                        key={photo.id}
                        src={photo.url}
                        alt={`${label} (photo ${photoIndex + 1} of ${count})`}
                        loading="lazy"
                        draggable="false"
                        {...zoomProps(photoIndex)}
                    />
                ))}
            </div>
            <span className="count">
                <Icon.photos />
                <span>
                    {index + 1}/{count}
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
                disabled={index === count - 1}
                onClick={() => goTo(index + 1)}
            >
                <Icon.next />
            </button>
            <div className="dots">
                {photos.map((photo, photoIndex) => (
                    <button
                        key={photo.id}
                        aria-label={`Show photo ${photoIndex + 1}`}
                        aria-current={photoIndex === index}
                        onClick={() => goTo(photoIndex)}
                    />
                ))}
            </div>
            {viewer}
        </div>
    );
}

export function Thumb({ photos, label }: GalleryProps) {
    const first = photos[0];
    return (
        <span className="thumb">
            {first && <img src={first.thumbUrl} alt={label} loading="lazy" />}
            {photos.length > 1 && <span className="n">{photos.length}</span>}
        </span>
    );
}
