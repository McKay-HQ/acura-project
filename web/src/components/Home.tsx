// Home: the car, what's left before it drives, the parts haul (pie charts by container),
// the previous owner's mods, and upgrade ideas.
import { useState, type FocusEvent, type PointerEvent } from 'react';
import { Icon } from './Icons';
import { money, valueRange, sumLow, sumHigh, topContainers, subContainers, href } from '../constants';
import type { Container, Part, Task } from '../types';

/** One chart slice: a container's parts, with count and value range. */
interface Segment {
    label: string;
    group: string;
    slot: number;
    n: number;
    lo: number;
    hi: number;
    mid: number;
}
/** A drawn slice: its SVG path and tooltip text. */
interface Slice {
    d: string;
    s: Segment;
    detail: string;
}
interface Tip extends Slice {
    x: number;
    y: number;
}
interface SegmentGroup {
    name: string;
    slot: number;
    segs: Segment[];
}

const midVal = (part: Pick<Part, 'valueLow' | 'valueHigh'>): number => {
    const lo = Number(part.valueLow ?? part.valueHigh) || 0;
    const hi = Number(part.valueHigh ?? part.valueLow) || 0;
    return (lo + hi) / 2;
};

/** Chart slices: each sub-container, plus parts directly in a parent (its sub-containers subtracted). */
function haulSegments(parts: Part[], boxes: Container[]): Segment[] {
    const segs: Segment[] = [];
    topContainers(boxes).forEach((top, index) => {
        const slot = Math.min(index, 6) + 1;
        const add = (label: string, ps: Part[]) => {
            if (ps.length)
                segs.push({
                    label,
                    group: top.name,
                    slot,
                    n: ps.length,
                    lo: sumLow(ps),
                    hi: sumHigh(ps),
                    mid: ps.reduce((sum, part) => sum + midVal(part), 0),
                });
        };
        const subs = subContainers(boxes, top.id);
        subs.forEach((sub) =>
            add(
                sub.name,
                parts.filter((part) => part.container?.id === sub.id),
            ),
        );
        add(
            subs.length ? `${top.name} (not in a sub-container)` : top.name,
            parts.filter((part) => part.container?.id === top.id),
        );
    });
    const loose = parts.filter((part) => !part.container);
    if (loose.length)
        segs.push({
            label: 'No container',
            group: 'No container',
            slot: 0,
            n: loose.length,
            lo: sumLow(loose),
            hi: sumHigh(loose),
            mid: loose.reduce((sum, part) => sum + midVal(part), 0),
        });
    return segs;
}

interface DonutProps {
    segs: Segment[];
    /** Which measure sizes the slices: part count or mid value. */
    k: 'n' | 'mid';
    title: string;
    center: string;
    sub: string;
}

function Donut({ segs, k, title, center, sub }: DonutProps) {
    const [tip, setTip] = useState<Tip | null>(null);
    const total = segs.reduce((sum, seg) => sum + seg[k], 0) || 1;
    const outerR = 90;
    const innerR = 56;
    const origin = 100;
    let ang = -Math.PI / 2;
    const pt = (rad: number, angle: number): [number, number] => [
        origin + rad * Math.cos(angle),
        origin + rad * Math.sin(angle),
    ];
    const paths = segs
        .filter((seg) => seg[k] > 0)
        .map((seg): Slice => {
            const a0 = ang;
            const a1 = ang + (2 * Math.PI * seg[k]) / total;
            ang = a1;
            const big = a1 - a0 > Math.PI ? 1 : 0;
            let pathData: string;
            if (a1 - a0 >= 2 * Math.PI - 1e-6)
                pathData = `M${origin} ${origin - outerR}A${outerR} ${outerR} 0 1 1 ${origin - 0.01} ${origin - outerR}L${origin - 0.01} ${origin - innerR}A${innerR} ${innerR} 0 1 0 ${origin} ${origin - innerR}Z`;
            else {
                const [x0, y0] = pt(outerR, a0);
                const [x1, y1] = pt(outerR, a1);
                const [x2, y2] = pt(innerR, a1);
                const [x3, y3] = pt(innerR, a0);
                pathData = `M${x0} ${y0}A${outerR} ${outerR} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${innerR} ${innerR} 0 ${big} 0 ${x3} ${y3}Z`;
            }
            const pct = Math.round((100 * seg[k]) / total);
            const detail =
                k === 'n'
                    ? `${seg.n} ${seg.n === 1 ? 'part' : 'parts'} · ${pct}%`
                    : `${valueRange(seg.lo, seg.hi)} · ${pct}% of value`;
            return { d: pathData, s: seg, detail };
        });
    const show = (event: PointerEvent<SVGPathElement> | FocusEvent<SVGPathElement>, slice: Slice) => {
        const el = event.currentTarget.closest('.piebox');
        if (!el) return;
        const box = el.getBoundingClientRect();
        // Focus events have no pointer position, so the tooltip centres near the top.
        const cx = 'clientX' in event ? event.clientX : undefined;
        const cy = 'clientY' in event ? event.clientY : undefined;
        const tipX = (cx ?? box.left + box.width / 2) - box.left;
        const tipY = (cy ?? box.top + 20) - box.top;
        setTip({ ...slice, x: Math.max(70, Math.min(box.width - 70, tipX)), y: tipY - 12 });
    };
    return (
        <figure className="pie">
            <figcaption>{title}</figcaption>
            <div className="piebox">
                <svg viewBox="0 0 200 200" role="img" aria-label={title}>
                    {paths.map((slice) => (
                        <path
                            key={slice.s.label}
                            d={slice.d}
                            className={`seg s${slice.s.slot}`}
                            tabIndex={0}
                            onPointerMove={(event) => show(event, slice)}
                            onPointerLeave={() => setTip(null)}
                            onFocus={(event) => show(event, slice)}
                            onBlur={() => setTip(null)}
                        >
                            <title>{`${slice.s.label}: ${slice.detail}`}</title>
                        </path>
                    ))}
                    <text x="100" y="96" className="pc1">
                        {center}
                    </text>
                    <text x="100" y="118" className="pc2">
                        {sub}
                    </text>
                </svg>
                {tip && (
                    <div className="ptip" style={{ left: tip.x, top: tip.y }}>
                        <b>{tip.s.label}</b>
                        <span>{tip.detail}</span>
                    </div>
                )}
            </div>
        </figure>
    );
}

function HaulCharts({ parts, boxes }: { parts: Part[]; boxes: Container[] }) {
    if (!parts.length) return null;
    const segs = haulSegments(parts, boxes);
    const lo = sumLow(parts);
    const hi = sumHigh(parts);
    const groups: SegmentGroup[] = [];
    segs.forEach((seg) => {
        let group = groups.find((item) => item.name === seg.group);
        if (!group) groups.push((group = { name: seg.group, slot: seg.slot, segs: [] }));
        group.segs.push(seg);
    });
    return (
        <div className="haulcharts">
            <div className="pies">
                <Donut segs={segs} k="n" title="Parts by container" center={String(parts.length)} sub="parts" />
                <Donut
                    segs={segs}
                    k="mid"
                    title="Estimated value by container"
                    center={money(Math.round((lo + hi) / 2))}
                    sub="estimated value"
                />
            </div>
            <div className="tblwrap plegend">
                <table className="tbl">
                    <thead>
                        <tr>
                            <th>Container</th>
                            <th className="num">Parts</th>
                            <th className="num">Est. value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((group) => {
                            const count = group.segs.reduce((sum, seg) => sum + seg.n, 0);
                            const kids = group.segs.length > 1 || group.segs[0].label !== group.name;
                            return [
                                <tr className="lg" key={group.name}>
                                    <td>
                                        <span className={`sw s${group.slot}`} />
                                        {group.name}
                                    </td>
                                    <td className="num">{count}</td>
                                    <td className="num">
                                        {valueRange(
                                            group.segs.reduce((sum, seg) => sum + seg.lo, 0),
                                            group.segs.reduce((sum, seg) => sum + seg.hi, 0),
                                        )}
                                    </td>
                                </tr>,
                                ...(kids
                                    ? group.segs.map((seg) => (
                                          <tr className="ls" key={`${group.name}/${seg.label}`}>
                                              <td>
                                                  {seg.label.replace(`${group.name} (not in a sub-container)`, 'Loose')}
                                              </td>
                                              <td className="num">{seg.n}</td>
                                              <td className="num">{valueRange(seg.lo, seg.hi)}</td>
                                          </tr>
                                      ))
                                    : []),
                            ];
                        })}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>Total</td>
                            <td className="num">{parts.length}</td>
                            <td className="num">{valueRange(lo, hi)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

interface HomeProps {
    parts: Part[];
    containers: Container[];
    tasks: Task[];
}

export default function Home({ parts, containers, tasks }: HomeProps) {
    const next = tasks.filter((task) => !task.done && task.phase === 1);
    return (
        <section id="homeView" style={{ display: 'grid', gap: 16 }}>
            <figure className="hero" style={{ margin: 0 }}>
                <img
                    src="/home/hero.jpg"
                    alt="The 2002 Acura RSX Type-S from the front left: black front end, hood and fender, silver body, factory 5-spoke wheels"
                />
                <figcaption className="cap">
                    <h2>2002 Acura RSX Type-S</h2>
                    <p>Bought for $2,600 · 173K miles · project in progress</p>
                </figcaption>
            </figure>
            <div className="homegrid">
                <div className="panel">
                    <h3>The car</h3>
                    <dl className="specs">
                        <dt>Engine</dt>
                        <dd>K20A2 2.0L i-VTEC, 200 hp / 142 lb-ft (factory)</dd>
                        <dt>Gearbox</dt>
                        <dd>6-speed manual</dd>
                        <dt>VIN</dt>
                        <dd>JH4DC548X2C010606</dd>
                        <dt>Bought</dt>
                        <dd>Oct 4, 2026, private sale in Madison, TN</dd>
                        <dt>Paid</dt>
                        <dd>$2,600</dd>
                        <dt>Odometer</dt>
                        <dd>173,840 miles when bought</dd>
                    </dl>
                    <a className="ibtn" href="#car" title="Open the car" aria-label="Open the car">
                        <Icon.forward />
                    </a>
                    <p>
                        Three-color body: black front clip and hood, silver body, dark blue rear bumper, passenger door
                        and passenger mirror. The previous owner lowered it, deleted the ABS and did the work listed
                        below. Missing pieces when bought: intake, washer reservoir, radio, driver door panel and the
                        hatch emblem. Front turn signals don't work.
                    </p>
                </div>
                <div className="panel">
                    <h3>Before it drives</h3>
                    <ul className="nextlist" id="homeNext">
                        {next.length ? (
                            next.map((task) => (
                                <li key={task.id}>
                                    <a className="plink" href={href.task(task)}>
                                        {task.title}
                                    </a>
                                </li>
                            ))
                        ) : (
                            <li>Nothing left before driving.</li>
                        )}
                    </ul>
                    <a className="ibtn" href="#tasks" title="Open tasks" aria-label="Open tasks">
                        <Icon.forward />
                    </a>
                    <p className="fine">
                        The timing chain, VTC and oil pump work is a good sign for the engine. Still check compression
                        and the shifter (2nd/3rd grind) early.
                    </p>
                </div>
            </div>
            <div className="panel">
                <h3>The parts haul</h3>
                <HaulCharts parts={parts} boxes={containers} />
                <div className="haul">
                    <p>
                        A large parts haul came with the car, mixed with parts from the previous owner's other Honda
                        projects. Everything is sorted on the Parts, Containers and Tossed tabs.
                    </p>
                    <div className="haulgrid">
                        <figure>
                            <img
                                src="/home/haul-laid-out.jpg"
                                alt="The whole parts haul laid out on the garage floor after cleaning"
                                loading="lazy"
                            />
                            <figcaption className="fine">The full haul, cleaned and laid out.</figcaption>
                        </figure>
                        <figure>
                            <img
                                src="/home/haul-sorted.jpg"
                                alt="The whole haul sorted into labeled bins: Other, Electrical, Body/Interior/Trim and Engine, each with its small inner bin, plus the Hardware - Ask Cody bin and the Hardware tray"
                                loading="lazy"
                            />
                            <figcaption className="fine">The full haul, sorted.</figcaption>
                        </figure>
                    </div>
                </div>
            </div>
            <div className="panel">
                <h3>Mods and recent work</h3>
                <p>From the previous owner's list, not yet verified on the car.</p>
                <ul style={{ margin: 0 }}>
                    <li>Suspension: Truhart coilovers, rear upper and lower control arms; new sway bar bushings</li>
                    <li>Exhaust: DC header, Yonaka full exhaust</li>
                    <li>
                        Drivetrain: Hardrace shifter, K-Tuned clutch slave cylinder and line kit (plus the recently
                        replaced clutch)
                    </li>
                    <li>Cooling and brakes: Mishimoto radiator, Brembo blank rotors and pads</li>
                    <li>Lighting: JDM side markers, OEM fog lights</li>
                    <li>
                        Engine: VTC actuator replaced; new timing chain, tensioner and guides; new oil pump, oil pump
                        chain and guides
                    </li>
                </ul>
            </div>
            <div className="panel">
                <h3>Performance upgrades to consider</h3>
                <p>
                    Header, exhaust, coilovers, rear arms, radiator, brakes, clutch and shifter are already done, and an
                    Injen intake is in the Engine box. Roughly in order of value once the basics are sorted:
                </p>
                <div className="upg">
                    <div>
                        <b>1. ECU tune</b>
                        <span>
                            The biggest gain for this setup. Intake, headers and exhaust run on the stock calibration
                            until it's tuned. Hondata K-Pro is the usual tool for 2002–04 RSX ECUs. Have it done by a
                            tuner, ideally on a dyno.
                        </span>
                    </div>
                    <div>
                        <b>2. Install the Injen intake</b>
                        <span>Already owned. Pairs with the tune.</span>
                    </div>
                    <div>
                        <b>3. Limited-slip differential</b>
                        <span>
                            The RSX Type-S came with an open diff, so the inside front wheel spins on hard corner exits.
                            An aftermarket helical LSD fixes it; it's a transmission-out job, so combine it with any
                            synchro rebuild. The clutch is new, so this can wait until the transmission comes out for
                            another reason.
                        </span>
                    </div>
                    <div>
                        <b>4. Alignment and brake fluid</b>
                        <span>
                            Coilovers, rear arms and Brembo rotors and pads are already on. What's left is setting ride
                            height, a proper alignment (adjustable rear arms make it tunable) and fresh brake fluid,
                            especially with ABS deleted.
                        </span>
                    </div>
                    <div>
                        <b>5. Shifter cable bushings</b>
                        <span>
                            The Hardrace shifter is in. If there's still slop, firmer shifter-cable bushings fix it.
                            Cheap and easy.
                        </span>
                    </div>
                    <div>
                        <b>6. Intake manifold</b>
                        <span>A larger aftermarket or swapped Honda manifold adds top-end power; it needs a tune.</span>
                    </div>
                </div>
                <p className="fine">
                    General guidance, not a build plan. Ask Cody before buying anything that touches brakes, suspension
                    or the ECU.
                </p>
            </div>
            <div className="panel">
                <h3>Turbo or supercharger?</h3>
                <p>
                    Both have been done on the K20A2. Settle the basics first: the car driving reliably, a compression
                    and leak-down test, and Cody's look at the engine.
                </p>
                <div className="fiwrap">
                    <table className="fitable">
                        <thead>
                            <tr>
                                <th>Setup</th>
                                <th>Crank hp (approx.)</th>
                                <th>0–60 (est.)</th>
                                <th>Cost (est., all in)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Stock</td>
                                <td data-l="Crank hp">200 (≈170–175 whp)</td>
                                <td data-l="0–60">6.8–7.2 s</td>
                                <td data-l="Cost">—</td>
                            </tr>
                            <tr>
                                <td>Supercharger, mild</td>
                                <td data-l="Crank hp">250–280</td>
                                <td data-l="0–60">5.8–6.3 s</td>
                                <td data-l="Cost">$4,500–7,500</td>
                            </tr>
                            <tr>
                                <td>Turbo, mild (6–8 psi, stock internals)</td>
                                <td data-l="Crank hp">250–300</td>
                                <td data-l="0–60">5.5–6.2 s</td>
                                <td data-l="Cost">$4,500–8,000</td>
                            </tr>
                            <tr>
                                <td>Turbo, aggressive (more boost + bolt-ons)</td>
                                <td data-l="Crank hp">300–375</td>
                                <td data-l="0–60">5.2–5.8 s</td>
                                <td data-l="Cost">$8,000–12,000</td>
                            </tr>
                            <tr>
                                <td>High-boost built engine</td>
                                <td data-l="Crank hp">400–600</td>
                                <td data-l="0–60">Traction-limited</td>
                                <td data-l="Cost">$15,000+</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="fine">
                    Costs include the kit, Hondata K-Pro and a tune, injectors and fuel pump, and install labor.
                    Aggressive builds add a boost-rated clutch and a limited-slip diff; built engines add forged
                    internals and transmission work. The new clutch may not hold boost: check its brand and rating.
                    Power figures are a mix of published kit claims and estimates; 0–60 times are estimates, and gains
                    beyond ~300 hp mostly show up above 30 mph because the RSX is front-wheel drive with an open diff.
                    Check state rules on emissions equipment before buying a kit.
                </p>
            </div>
        </section>
    );
}
