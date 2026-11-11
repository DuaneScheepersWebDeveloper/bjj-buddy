/**
 * Little stick-figure pictures for techniques (original drawings for BJJ Buddy).
 * Each pose has two figures: "you" (drawn in red) and your "partner" (grey), in a 64 x 48 box.
 * A figure is a head, a neck, a hip, two arms (elbow, hand) and two legs (knee, foot).
 * iconFor() picks the right pose for any technique, including ones users add themselves.
 */
import type { Category, Position, Technique } from './types';

type Pt = [number, number];
export type Figure = { head: Pt; neck: Pt; hip: Pt; arms: [Pt, Pt][]; legs: [Pt, Pt][] };
export type Pose = { label: string; you: Figure; partner: Figure; arrow?: string; arrowHead?: Pt[] };

export const POSES = {
  takedown: {
    label: "Takedown",
    you: { head: [30, 23], neck: [27, 25], hip: [14, 31], arms: [[[33, 29], [42, 32]], [[32, 31], [41, 37]]], legs: [[[9, 37], [3, 44]], [[20, 40], [13, 44]]] },
    partner: { head: [46, 8], neck: [46, 13], hip: [45, 29], arms: [[[39, 19], [33, 23]], [[41, 21], [36, 26]]], legs: [[[43, 37], [41, 44]], [[48, 37], [51, 44]]] },
  },
  guard: {
    label: "Guard",
    you: { head: [6, 40], neck: [11, 40], hip: [23, 41], arms: [[[18, 34], [25, 31]], [[16, 36], [22, 35]]], legs: [[[30, 30], [44, 31]], [[31, 35], [42, 36]]] },
    partner: { head: [44, 11], neck: [44, 16], hip: [46, 31], arms: [[[40, 24], [36, 31]], [[42, 25], [39, 33]]], legs: [[[41, 43], [54, 44]], [[45, 43], [58, 44]]] },
  },
  pass: {
    label: "Pass",
    you: { head: [38, 10], neck: [38, 15], hip: [40, 29], arms: [[[32, 21], [25, 25]], [[34, 22], [27, 30]]], legs: [[[33, 36], [30, 44]], [[46, 36], [48, 44]]] },
    partner: { head: [5, 41], neck: [10, 41], hip: [22, 41], arms: [[[16, 36], [22, 33]], [[15, 38], [20, 37]]], legs: [[[25, 30], [30, 25]], [[27, 33], [32, 32]]] },
  },
  sweep: {
    label: "Sweep",
    you: { head: [6, 41], neck: [11, 41], hip: [22, 41], arms: [[[17, 34], [24, 29]], [[15, 36], [20, 33]]], legs: [[[25, 30], [31, 22]], [[28, 34], [34, 27]]] },
    partner: { head: [47, 31], neck: [43, 27], hip: [32, 18], arms: [[[49, 24], [54, 28]], [[46, 22], [51, 19]]], legs: [[[25, 11], [20, 4]], [[34, 9], [38, 2]]] },
    arrow: "M 44 8 Q 56 10 58 22",
    arrowHead: [[58, 22], [54, 18], [60, 17]],
  },
  mount: {
    label: "Mount",
    you: { head: [30, 12], neck: [30, 17], hip: [30, 32], arms: [[[24, 24], [18, 36]], [[36, 24], [40, 34]]], legs: [[[22, 38], [30, 39]], [[38, 38], [44, 39]]] },
    partner: { head: [6, 40], neck: [11, 41], hip: [36, 42], arms: [[[14, 35], [19, 30]], [[17, 37], [23, 35]]], legs: [[[47, 42], [58, 42]], [[48, 43], [59, 44]]] },
  },
  side: {
    label: "Side control",
    you: { head: [14, 28], neck: [19, 29], hip: [42, 31], arms: [[[18, 36], [10, 40]], [[24, 36], [30, 39]]], legs: [[[49, 38], [56, 43]], [[45, 39], [52, 44]]] },
    partner: { head: [6, 41], neck: [11, 41], hip: [36, 42], arms: [[[16, 35], [22, 31]], [[14, 36], [18, 33]]], legs: [[[47, 42], [58, 42]], [[47, 43], [58, 44]]] },
  },
  back: {
    label: "Back control",
    you: { head: [20, 10], neck: [21, 15], hip: [18, 34], arms: [[[30, 15], [38, 19]], [[29, 20], [37, 22]]], legs: [[[31, 30], [40, 36]], [[29, 38], [37, 42]]] },
    partner: { head: [37, 13], neck: [36, 18], hip: [32, 35], arms: [[[40, 26], [44, 32]], [[38, 27], [41, 34]]], legs: [[[45, 33], [56, 42]], [[44, 37], [55, 44]]] },
  },
  armlock: {
    label: "Armlock",
    you: { head: [7, 40], neck: [12, 40], hip: [28, 41], arms: [[[20, 33], [30, 25]], [[18, 35], [29, 28]]], legs: [[[34, 32], [44, 34]], [[38, 38], [50, 40]]] },
    partner: { head: [52, 36], neck: [47, 38], hip: [42, 43], arms: [[[38, 30], [30, 24]], [[50, 43], [54, 44]]], legs: [[[52, 44], [60, 44]], [[50, 44], [58, 43]]] },
  },
  choke: {
    label: "Choke",
    you: { head: [22, 8], neck: [23, 13], hip: [22, 29], arms: [[[30, 17], [36, 23]], [[29, 20], [35, 26]]], legs: [[[19, 37], [16, 44]], [[26, 37], [27, 44]]] },
    partner: { head: [33, 23], neck: [38, 24], hip: [53, 25], arms: [[[41, 31], [41, 38]], [[44, 30], [45, 37]]], legs: [[[53, 35], [52, 44]], [[57, 34], [59, 44]]] },
  },
  triangle: {
    label: "Triangle",
    you: { head: [6, 41], neck: [11, 41], hip: [22, 41], arms: [[[17, 35], [25, 33]], [[15, 37], [21, 37]]], legs: [[[24, 22], [38, 20]], [[34, 37], [38, 21]]] },
    partner: { head: [29, 28], neck: [34, 30], hip: [47, 34], arms: [[[33, 36], [29, 40]], [[37, 37], [34, 42]]], legs: [[[43, 43], [55, 44]], [[47, 43], [59, 44]]] },
  },
  leglock: {
    label: "Leg lock",
    you: { head: [6, 40], neck: [11, 40], hip: [24, 41], arms: [[[21, 32], [30, 28]], [[19, 34], [29, 31]]], legs: [[[32, 34], [40, 30]], [[32, 40], [42, 42]]] },
    partner: { head: [56, 24], neck: [54, 28], hip: [48, 40], arms: [[[50, 34], [46, 39]], [[58, 34], [60, 40]]], legs: [[[38, 34], [29, 29]], [[40, 42], [34, 44]]] },
  },
  escape: {
    label: "Escape",
    you: { head: [6, 41], neck: [11, 40], hip: [26, 33], arms: [[[17, 31], [22, 25]], [[15, 34], [20, 30]]], legs: [[[33, 38], [34, 44]], [[31, 40], [30, 44]]] },
    partner: { head: [47, 10], neck: [44, 15], hip: [33, 27], arms: [[[38, 22], [30, 26]], [[48, 22], [52, 27]]], legs: [[[24, 30], [18, 34]], [[40, 32], [46, 36]]] },
    arrow: "M 50 6 Q 60 12 58 26",
    arrowHead: [[58, 26], [54, 21], [61, 21]],
  },
} satisfies Record<string, Pose>;

export type PoseId = keyof typeof POSES;

// Name keywords -> pose, checked in order (first match wins).
const BY_NAME: [RegExp, PoseId][] = [
  [/triangle/i, 'triangle'],
  [/heel hook|ankle|knee ?bar|toe hold|calf|leg lock/i, 'leglock'],
  [/rear naked|bow and arrow|clock choke|took the back|back take|back escape/i, 'back'],
  [/choke|guillotine|d'arce|darce|anaconda|ezekiel|gogoplata/i, 'choke'],
  [/armbar|arm ?lock|kimura|americana|omoplata|wrist|arm ?drag/i, 'armlock'],
  [/mount/i, 'mount'],
  [/side control|knee on belly|north.south|kesa/i, 'side'],
  [/recovered guard|guard pull|guard/i, 'guard'],
  [/single leg|double leg/i, 'takedown'],
];

const BY_CATEGORY: Record<Category, PoseId> = {
  submission: 'armlock',
  pass: 'pass',
  sweep: 'sweep',
  escape: 'escape',
  takedown: 'takedown',
  position: 'mount',
};

/** The pose to show for a technique. Escapes and passes keep their own picture even if the name mentions a position. */
export function iconFor(t: { name: string; category: Category; position?: Position }): PoseId {
  if (t.category === 'escape') return 'escape';
  if (t.category === 'pass') return 'pass';
  if (t.category === 'sweep') return 'sweep';
  if (t.category === 'takedown') return /guard pull/i.test(t.name) ? 'guard' : 'takedown';
  for (const [re, pose] of BY_NAME) if (re.test(t.name)) return pose;
  return BY_CATEGORY[t.category];
}

export type { Technique };
