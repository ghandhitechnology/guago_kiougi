/**
 * The fight on screen (PLAN §6): `FightView.attach(scene, mapView, room, options)` draws every
 * monster, student, minion, effect, tell and drop of the room's fight snapshots with the hit feel
 * of PLAN §6, plays its sound and takes its controls; `state` is what the HUD reads and `actions`
 * what its buttons call. See `fight-view.ts` for the wiring.
 */
export { type FightOptions, FightView } from "./fight-view.ts";
export type { BookState, FightActions, FightState, TargetState, WavePhase } from "./state.ts";
