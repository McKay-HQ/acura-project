// The Car tab: photo sets of the car itself and what they show. Photos are static files in
// public/car/<folder>/NN.jpg, each with a small NN-t.jpg thumbnail beside it.

export interface CarSection {
    key: 'exterior' | 'engine' | 'interior';
    title: string;
    /** Number of photos, named 01.jpg, 02.jpg, ... */
    count: number;
}

export const CAR_SECTIONS: CarSection[] = [
    { key: 'exterior', title: 'Exterior', count: 8 },
    { key: 'engine', title: 'Engine bay', count: 16 },
    { key: 'interior', title: 'Interior', count: 14 },
];

export interface CarPhoto {
    src: string;
    thumb: string;
}

export function carPhotos(s: CarSection): CarPhoto[] {
    return Array.from({ length: s.count }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return { src: `/car/${s.key}/${n}.jpg`, thumb: `/car/${s.key}/${n}-t.jpg` };
    });
}

export const CONDITION_DATE = 'October 16, 2026';

export const CONDITION: Record<CarSection['key'], string[]> = {
    exterior: [
        'Black hood, front fenders and front bumper; dark blue rear bumper, passenger door and passenger mirror; the rest is silver.',
        "The hood's clear coat is peeling, with faded purple patches.",
        'Large patch of bare body filler on the passenger-side rear quarter panel, just behind the door.',
        "The rear spoiler's clear coat is peeling, and the center emblem on the hatch is missing.",
    ],
    interior: [
        'Driver door panel off; the moisture barrier is torn and hanging.',
        'Both front seat bottoms torn through to the foam.',
        'Radio missing; lower dash panels around the column are off, with wiring and connectors hanging loose, including the yellow airbag connectors.',
        'Surface rust on the dash support beam, steering column bracket and pedal assembly.',
    ],
    engine: [
        'No intake: the throttle body and the breather hose are open (the Injen intake is in the Engine box).',
        'No washer reservoir.',
        'Visible mods: Mishimoto radiator, coilover top mounts, a Hasport engine mount, aftermarket headers with no heat shield, braided clutch line.',
        'Oily grime along the back of the head above the headers.',
        'Bubbled, crusty paint on the body next to the battery; battery dated 4/23.',
        'Surface rust on the steering rack tie rods, transmission brackets and a loose-looking ground terminal on the transmission.',
        'Cut wires near the power steering reservoir.',
    ],
};

/** Tasks that follow up on the condition notes, by task key. */
export const CONDITION_TASKS = [
    'paint-match-front',
    'repair-seat-bolster',
    'check-water-leaks',
    'install-driver-door-panel',
    'trace-underdash-connectors',
    'install-injen-intake',
    'install-washer-reservoir',
    'basic-service',
    'check-header-clearances',
    'fix-front-turn-signals',
];
