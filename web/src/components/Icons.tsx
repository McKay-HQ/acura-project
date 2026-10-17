// Small stroke icons, drawn with currentColor so they follow the theme.
import type { ReactNode, SVGProps } from 'react';
import type { ContainerIcon } from '../types';

const Svg = ({ children, ...p }: SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...p}
    >
        {children}
    </svg>
);

export const Icon = {
    edit: () => (
        <Svg>
            <path d="M4 20h4L19 9l-4-4L4 16v4z" />
            <path d="M13.5 6.5l4 4" />
        </Svg>
    ),
    tagSale: () => (
        <Svg>
            <path d="M3 12V4h8l10 10-8 8L3 12z" />
            <circle cx="7.5" cy="8.5" r="1.5" />
        </Svg>
    ),
    untagSale: () => (
        <Svg>
            <path d="M3 12V4h8l10 10-8 8L3 12z" />
            <path d="M4 20L20 4" />
        </Svg>
    ),
    trash: () => (
        <Svg>
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
        </Svg>
    ),
    toss: () => (
        <Svg>
            <path d="M4 7h16M6 7l1 13h10l1-13" />
            <path d="M9.5 11.5l5 5M14.5 11.5l-5 5" />
        </Svg>
    ),
    check: () => (
        <Svg>
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l2.7 2.7L16 9.8" />
        </Svg>
    ),
    question: () => (
        <Svg>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5" />
            <path d="M12 16.8v.2" />
        </Svg>
    ),
    dollar: () => (
        <Svg>
            <circle cx="12" cy="12" r="9" />
            <path d="M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.5 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.3M12 6.5V8M12 16v1.5" />
        </Svg>
    ),
    photos: () => (
        <Svg strokeWidth="1.8">
            <rect x="2.5" y="6" width="15" height="15" rx="2" />
            <path d="M6.5 2.5h12a3 3 0 0 1 3 3v12" />
        </Svg>
    ),
    filter: () => (
        <Svg strokeWidth="1.8">
            <path d="M3 5h18M6.5 12h11M10 19h4" />
        </Svg>
    ),
    lock: () => (
        <Svg>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </Svg>
    ),
    unlock: () => (
        <Svg>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 7.5-2" />
        </Svg>
    ),
    cards: () => (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
    ),
    table: () => (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="1" y="2" width="14" height="2.2" rx=".6" />
            <rect x="1" y="6.9" width="14" height="2.2" rx=".6" />
            <rect x="1" y="11.8" width="14" height="2.2" rx=".6" />
        </svg>
    ),
    star: () => (
        <Svg>
            <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7L12 3z" />
        </Svg>
    ),
    x: () => (
        <Svg>
            <path d="M6 6l12 12M18 6L6 18" />
        </Svg>
    ),
    plus: () => (
        <Svg>
            <path d="M12 5v14M5 12h14" />
        </Svg>
    ),
    yes: () => (
        <Svg>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
        </Svg>
    ),
    up: () => (
        <Svg>
            <path d="M6 15l6-6 6 6" />
        </Svg>
    ),
    down: () => (
        <Svg>
            <path d="M6 9l6 6 6-6" />
        </Svg>
    ),
    prev: () => (
        <Svg>
            <path d="M15 6l-6 6 6 6" />
        </Svg>
    ),
    next: () => (
        <Svg>
            <path d="M9 6l6 6-6 6" />
        </Svg>
    ),
    moon: () => (
        <Svg>
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </Svg>
    ),
    sun: () => (
        <Svg>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </Svg>
    ),
    back: () => (
        <Svg>
            <path d="M19 12H5M11 6l-6 6 6 6" />
        </Svg>
    ),
    forward: () => (
        <Svg>
            <path d="M5 12h14M13 6l6 6-6 6" />
        </Svg>
    ),
};
export type IconName = keyof typeof Icon;

/** Container icons, picked per container. */
export const BOX_ICONS = {
    trim: [
        'Body / trim',
        <>
            <path d="M4 4h11l5 6v10H4z" />
            <path d="M4 10h16" />
            <path d="M14 13h3" />
        </>,
    ],
    engine: [
        'Engine',
        <>
            <path d="M7 8h7l2 2h2v3h2v-2h1v6h-1v-2h-2v3h-3l-2 2H8l-2-2H4v-4H3v-2h1v-2h3z" />
            <path d="M9 8V6h4v2" />
        </>,
    ],
    electrical: ['Electrical', <path d="M13 2L5 14h6l-1 8 8-12h-6z" />],
    other: [
        'Other',
        <>
            <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
            <path d="M3 7l9 4 9-4M12 11v10" />
        </>,
    ],
    askcody: [
        'Ask Cody',
        <>
            <path d="M4 5h16v11H9l-5 4z" />
            <path d="M10 9a2 2 0 1 1 2.6 1.9c-.4.1-.6.5-.6.9V12" />
            <path d="M12 14.2v.1" />
        </>,
    ],
    none: [
        'Loose / none',
        <>
            <rect x="7" y="3" width="10" height="16" rx="1" transform="rotate(12 12 11)" />
            <path d="M3 21h18" />
        </>,
    ],
    hardware: [
        'Hardware',
        <>
            <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" />
            <circle cx="12" cy="12" r="3.5" />
        </>,
    ],
    box: [
        'Box',
        <>
            <rect x="3" y="7" width="18" height="13" rx="1" />
            <path d="M3 7l2-4h14l2 4M9 11h6" />
        </>,
    ],
} satisfies Record<ContainerIcon, [label: string, glyph: ReactNode]>;
export type BoxIconName = keyof typeof BOX_ICONS;
export const isBoxIcon = (k: string): k is BoxIconName => Object.hasOwn(BOX_ICONS, k);

export function BoxIcon({ icon }: { icon: BoxIconName }) {
    return (
        <span className="bic" aria-hidden="true">
            <Svg>{(BOX_ICONS[icon] || BOX_ICONS.box)[1]}</Svg>
        </span>
    );
}
