/**
 * 첫 균열: the opening's field fight (beat 5, the golem), until the whistle.
 *
 * The night field's own score played at double speed, 144 BPM, with a kick and a pulsing bass
 * under it: the same rift, now hostile. The bent school motif becomes urgent; nothing new is
 * borrowed. Same form as 운동장 23:40, so the loop returns to its A.
 */

import type { SongSource } from "../../tracker/format.ts";
import { fieldNight } from "./field-night.ts";
import { bars, times } from "./write.ts";

const pulse = (chords: string) =>
  bars(
    ...chords.split(" ").map((c) => {
      const lo = `${c}2`;
      const hi = `${c}3`;
      return `${lo}*2 ${hi}*2 ${lo}*2 ${hi}*2 ${lo}*2 ${hi}*2 ${lo}*2 ${hi}*2`;
    }),
  );

const GROOVE = "K*4 S*4 K*2 K*2 S*4";
const DRIVE = "K*2 Hv6*2 S*2 Hv6*2 K*2 K*2 S*2 Hv7*2";

export const riftFirst: SongSource = {
  ...fieldNight,
  title: "첫 균열",
  bpm: 144,
  gain: -1,
  instruments: {
    ...fieldNight.instruments,
    pulse: {
      kind: "osc",
      gain: 0.13,
      osc: [
        { wave: "pulse", duty: 0.5 },
        { wave: "tri", gain: 0.8 },
      ],
      env: { a: 0.004, d: 0.12, s: 0.6, r: 0.05 },
      filter: { type: "lp", cutoff: 800, env: 0.8, decay: 0.06 },
    },
    drive: { kind: "kit", gain: 0.3, pieces: { K: { gain: 1 }, S: { gain: 0.8 }, H: { gain: 2 } } },
  },
  channels: [
    ...fieldNight.channels,
    { name: "pulse", instrument: "pulse", stem: "base", reverb: 0.05 },
    { name: "drive", instrument: "drive", stem: "extra", reverb: 0.15 },
  ],
  phrases: {
    ...fieldNight.phrases,
    pulseI: pulse("F F F F"),
    pulseA: pulse("F F Db Db Bb Bb C C"),
    pulseB: pulse("C C C C Db Db C C"),
    pulseA2: pulse("Db Db Bb Bb Gb Gb Gb C"),
    pulseO: pulse("F F F F"),
    driveI: bars("-*16", "-*16", "K*4 K*4 K*4 K*4", "K*4 K*4 K*2 S S S*2 S S"),
    driveA: bars(times(GROOVE, 7), "K*2 S*2 K*2 S*2 S S S S S S S S"),
    driveB: times(DRIVE, 8),
    driveA2: bars(times(GROOVE, 7), "K*2 S*2 K*2 S*2 S S S S Sv9 Svb Svd Svf"),
    driveO: times("K*8 S*8", 4),
  },
  order: fieldNight.order.map((f, i) => ({
    ...f,
    pulse: ["pulseI", "pulseA", "pulseB", "pulseA2", "pulseO"][i] as string,
    drive: ["driveI", "driveA", "driveB", "driveA2", "driveO"][i] as string,
  })),
};
