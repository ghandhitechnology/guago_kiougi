/** Ambient beds. They never loop: every layer drifts on its own random path. */

import type { BedSource } from "../ambient/format.ts";

export const BEDS_SOURCE = {
  /** The campus yard in late afternoon: wind in the 해솔 pine, gulls far off, students elsewhere. */
  "campus-afternoon": {
    title: "해솔 마당, 오후",
    gain: 0,
    space: 2.2,
    layers: [
      {
        kind: "noise",
        color: "pink",
        filter: { type: "bp", freq: 900, q: 0.7 },
        sway: { rate: 0.08, depth: 0.8 },
        gust: { rate: 0.12, depth: 0.7 },
        gain: -19,
        width: 0.8,
      },
      {
        kind: "noise",
        color: "white",
        filter: { type: "hp", freq: 4500 },
        sway: { rate: 0.1, depth: 0.5 },
        gust: { rate: 0.15, depth: 0.85 },
        gain: -33,
        width: 0.9,
      },
      {
        kind: "noise",
        color: "brown",
        filter: { type: "lp", freq: 180 },
        gust: { rate: 0.05, depth: 0.5 },
        gain: -22,
        width: 0.5,
      },
      { kind: "events", call: "gull", every: [6, 14], gain: -29, distance: [0.5, 0.95] },
      { kind: "events", call: "voices", every: [2.5, 7], gain: -26, distance: [0.6, 0.95] },
      { kind: "events", call: "laugh", every: [12, 30], gain: -26, distance: [0.6, 0.9] },
    ],
  },
  /** The 운동장 at 23:40: crickets, the sea wind, the rift breathing in the middle of the field. */
  "field-night": {
    title: "운동장, 밤",
    gain: 0,
    space: 3,
    layers: [
      { kind: "insects", count: 7, freq: [3900, 5200], rate: [1.2, 2.2], pulses: 3, gain: -23 },
      {
        kind: "noise",
        color: "pink",
        filter: { type: "bp", freq: 600, q: 0.6 },
        sway: { rate: 0.05, depth: 1 },
        gust: { rate: 0.08, depth: 0.7 },
        gain: -20,
        width: 0.8,
      },
      {
        kind: "noise",
        color: "brown",
        filter: { type: "lp", freq: 150 },
        gust: { rate: 0.04, depth: 0.5 },
        gain: -21,
      },
      { kind: "throb", freq: 41, rate: 0.45, shimmer: 0.7, gain: -20.5 },
    ],
  },
  /** Inside a school building: fluorescent tubes, the building's own rumble, a door far away. */
  "school-interior": {
    title: "교실, 복도",
    gain: 3,
    space: 1.4,
    layers: [
      {
        kind: "hum",
        freq: 120,
        partials: [1, 0.45, 0.25, 0.12, 0.08, 0.05],
        buzz: 0.25,
        gain: -34,
        pan: 0.2,
      },
      { kind: "noise", color: "brown", filter: { type: "lp", freq: 120 }, gain: -23, width: 0.4 },
      { kind: "noise", color: "pink", filter: { type: "lp", freq: 2500 }, gain: -42, width: 0.9 },
      { kind: "events", call: "door", every: [8, 20], gain: -16, distance: [0.6, 1] },
      { kind: "events", call: "voices", every: [10, 25], gain: -30, distance: [0.8, 1] },
    ],
  },
} as const satisfies Record<string, BedSource>;
