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
    caption: string;
}

/** What each photo shows, in photo order. */
const CAPTIONS: Record<CarSection['key'], string[]> = {
    exterior: [
        "Front: black bumper, hood and fenders; the hood's clear coat is peeling",
        'Front left, with the silver driver door',
        'Driver side: black fender, silver door and rear quarter',
        'Rear left: silver hatch and quarter, dark blue rear bumper',
        'Rear: dark blue bumper, silver hatch and spoiler, missing center emblem',
        'Rear right: bare body filler on the quarter panel behind the passenger door',
        'Passenger side: dark blue door and mirror, filler patch on the quarter panel',
        'Front right: black fender and dark blue passenger door',
    ],
    engine: [
        'Engine bay from the front: no intake, Mishimoto radiator, battery on the right',
        'Passenger-side strut tower: coilover top mount, Hasport engine mount',
        'Power steering reservoir (red cap) and pump, with cut wires beside it',
        'Intake manifold and power steering pump',
        'Throttle body open (no intake) and the battery',
        'Battery (NAPA Legend, dated 4/23) and bubbled paint next to it',
        'Under-hood fuse box and driver-side strut tower',
        'Brake and clutch fluid reservoirs at the firewall, steering rack below',
        'Shift cables on the transmission and a rusty ground terminal',
        'Valve cover: oil filler cap, dipstick (orange) and coil packs',
        'Open throttle body and the breather hose',
        'Steering rack, tie rods and transmission from above',
        'Open breather hose and fuel lines behind the throttle body',
        'Aftermarket headers with no heat shield; oily grime along the head above',
        'Headers and the crumpled heat shield over the crossmember',
        'Steering rack boot and tie rod',
    ],
    interior: [
        'Driver door with the panel off; the moisture barrier is torn',
        'Driver seat: torn seat bottom bolster',
        'Front seats from the passenger side: both seat bottoms torn',
        'Dash and steering wheel; trim around the column is off',
        'Radio opening: radio missing, wiring loose',
        'Behind the radio opening: wiring and modules',
        'Passenger door and footwell',
        'Passenger seat: torn cushion',
        'Passenger side of the dash, with unplugged connectors hanging',
        'Unplugged connectors in the passenger footwell',
        'Center stack from the passenger side: rusty dash support bracket',
        'Glovebox out: rusty dash support beam and the heater box',
        'Under the steering column: yellow airbag connectors and the pedals',
        'Under-dash fuse box and rusty steering column bracket',
    ],
};

export function carPhotos(s: CarSection): CarPhoto[] {
    return Array.from({ length: s.count }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return {
            src: `/car/${s.key}/${n}.jpg`,
            thumb: `/car/${s.key}/${n}-t.jpg`,
            caption: CAPTIONS[s.key][i] || `${s.title} photo ${i + 1}`,
        };
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
