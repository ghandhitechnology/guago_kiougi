/**
 * Emotes on a body (PLAN §12): a short motion drawn in code while the emote art is not drawn
 * yet, on top of whatever the body is doing. Scale and tilt only, so the actor that places and
 * animates the body each frame is never fought.
 */
import type * as Phaser from "phaser";

type Motion = { scaleX?: number; scaleY?: number; angle?: number; ms: number; repeat: number };

const MOTIONS: Readonly<Record<string, Motion>> = {
  wave: { angle: 6, ms: 90, repeat: 3 },
  clap: { scaleX: 1.1, ms: 70, repeat: 3 },
  lol: { scaleY: 0.92, ms: 60, repeat: 4 },
  sleepy: { scaleY: 0.94, angle: 4, ms: 420, repeat: 0 },
  fighting: { scaleX: 1.12, scaleY: 1.12, ms: 120, repeat: 1 },
  bow: { scaleY: 0.82, ms: 220, repeat: 0 },
  dance: { angle: 10, ms: 140, repeat: 5 },
  meltdown: { scaleX: 1.08, scaleY: 0.9, angle: -5, ms: 50, repeat: 6 },
};

export function playEmote(body: Phaser.GameObjects.Sprite, id: string): void {
  const m = MOTIONS[id];
  if (!m) return;
  const scene = body.scene;
  scene.tweens.killTweensOf(body);
  body.setScale(1).setAngle(0);
  scene.tweens.add({
    targets: body,
    ...(m.scaleX === undefined ? {} : { scaleX: m.scaleX }),
    ...(m.scaleY === undefined ? {} : { scaleY: m.scaleY }),
    ...(m.angle === undefined ? {} : { angle: m.angle }),
    duration: m.ms,
    yoyo: true,
    repeat: m.repeat,
    ease: "Sine.InOut",
    onComplete: () => body.setScale(1).setAngle(0),
  });
}
