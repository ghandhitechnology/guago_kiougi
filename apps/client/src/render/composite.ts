/**
 * Two filters, both at the game's own 480×270 so every effect lands on the art's pixel grid.
 *
 * `LightComposite` sits on the ground layer: it multiplies the ground by the light map and bands
 * the light into a few steps with an ordered dither at the band edges, locked to world pixels so
 * the pattern travels with the ground. Inside a rift it shimmers the ground's rows a whole pixel
 * at a time and splits colour at the torn lip; only the ground, so nothing standing in the tear
 * jags.
 *
 * `Grade` sits on the whole world: it grades every pixel through a palette-aware lookup table,
 * and for a boss's entrance drains the world to shades of one colour, then floods the colour
 * back outward from a point behind a dithered edge.
 */
import * as Phaser from "phaser";
import { worldScroll } from "./cutaway.ts";
import { LIGHT_MARGIN } from "./light-field.ts";

const BAYER = `
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}
`;

const LIGHT_FRAG = `#pragma phaserTemplate(shaderName)
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D uLight;
uniform sampler2D uRift;
uniform vec2 uRes;
uniform vec2 uLightRes;
uniform float uMargin;
uniform vec2 uScroll;
uniform float uSteps;
uniform float uSharp;
uniform float uDither;
uniform vec4 uRiftRect;
uniform float uRiftOn;
uniform float uTime;
uniform float uHaze;
uniform float uChroma;
uniform vec3 uAmbient;

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)
${BAYER}

void main () {
  vec2 uv = outTexCoord;
  vec2 screen = floor(vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y));
  vec2 world = screen + uScroll;
  vec2 rift = vec2(0.0);
  if (uRiftOn > 0.5) {
    vec2 ruv = (world + 0.5 - uRiftRect.xy) / uRiftRect.zw;
    if (ruv.x >= 0.0 && ruv.y >= 0.0 && ruv.x <= 1.0 && ruv.y <= 1.0) {
      rift = texture2D(uRift, vec2(ruv.x, 1.0 - ruv.y)).rg;
    }
    // Heat over the tear, deep inside it: thin runs of rows slip a whole pixel and climb.
    float wave = sin(world.y * 0.5 + uTime * 3.1) * sin(world.y * 0.11 - uTime * 0.9 + world.x * 0.015);
    uv.x += sign(wave) * step(0.72, abs(wave) * rift.x * uHaze) / uRes.x;
  }
  vec4 albedo = texture2D(uMainSampler, uv);
  if (uChroma > 0.0 && rift.y > 0.5) {
    float k = uChroma / uRes.x;
    albedo.r = texture2D(uMainSampler, uv + vec2(k, 0.0)).r;
    albedo.b = texture2D(uMainSampler, uv - vec2(k, 0.0)).b;
  }
  if (albedo.a <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 luv = vec2((screen.x + uMargin + 0.5) / uLightRes.x, 1.0 - (screen.y + uMargin + 0.5) / uLightRes.y);
  // Bands count how far the light strays from the ambient, so open ground at ambient stays flat;
  // light below it (a cold rift cooling warm ground) is banded the same way.
  vec3 delta = texture2D(uLight, luv).rgb * 2.0 - uAmbient;
  vec3 mag = abs(delta);
  float peak = max(max(mag.r, mag.g), max(mag.b, 0.0001));
  float q = peak * uSteps;
  float lower = floor(q);
  float t = clamp((q - lower - 0.5) * uSharp + 0.5, 0.0, 1.0);
  float d = mix(0.5, bayer4(world) + 0.03125, uDither);
  float stepped = (lower + step(d, t)) / uSteps;
  vec3 light = uAmbient + delta * (stepped / peak);
  gl_FragColor = vec4(albedo.rgb * light, albedo.a);
}
`;

const GRADE_FRAG = `#pragma phaserTemplate(shaderName)
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D uLut;
uniform vec2 uRes;
uniform vec2 uScroll;
uniform float uDrain;
uniform vec3 uDrainColor;
uniform vec3 uFlood;

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)
${BAYER}

vec3 grade(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  float r = floor(c.r * 31.0 + 0.5);
  float g = floor(c.g * 31.0 + 0.5);
  float b = floor(c.b * 31.0 + 0.5);
  // Canvas textures upload flipped, so the table's rows run upward.
  return texture2D(uLut, vec2((b * 32.0 + r + 0.5) / 1024.0, 1.0 - (g + 0.5) / 32.0)).rgb;
}

void main () {
  vec4 c = texture2D(uMainSampler, outTexCoord);
  if (c.a <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 rgb = grade(c.rgb / c.a);
  if (uDrain > 0.0) {
    vec2 screen = floor(vec2(outTexCoord.x * uRes.x, (1.0 - outTexCoord.y) * uRes.y));
    vec2 world = screen + uScroll;
    // Four shades of one colour, by brightness.
    float y = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float s = floor(clamp(y * 1.15, 0.0, 0.999) * 4.0) / 3.0;
    vec3 drained = s < 0.5 ? mix(uDrainColor * 0.18, uDrainColor, s * 2.0) : mix(uDrainColor, vec3(1.0), (s - 0.5) * 1.1);
    float k = uDrain;
    if (uFlood.z > 0.0) {
      // Colour returns outward from the flood's centre, its edge dithered.
      float r = length(world + 0.5 - uFlood.xy) / uFlood.z;
      k *= step(0.0, r - 1.0 + (bayer4(world) - 0.5) * 0.12);
    }
    rgb = mix(rgb, drained, k);
  }
  gl_FragColor = vec4(rgb * c.a, c.a);
}
`;

type Texture = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

/** Settings the ground's light composite reads every frame. */
export class LightComposite extends Phaser.Filters.Controller {
  light: Texture | null = null;
  lightW = 1;
  lightH = 1;
  /** Light steps per unit of light: more steps, narrower bands. */
  steps = 4;
  /** How narrow the dithered seam between two bands is: 1 dithers the whole step. */
  sharp = 9;
  dither = true;
  rift: Texture | null = null;
  riftRect: [number, number, number, number] = [0, 0, 1, 1];
  time = 0;
  haze = 0;
  chroma = 0;
  ambient: [number, number, number] = [1, 1, 1];

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, LIGHT_NODE);
  }
}

/** Settings the grade reads every frame. */
export class Grade extends Phaser.Filters.Controller {
  lut: Texture | null = null;
  /** 0 is the world's own colour, 1 all of it drained to `drainColor`. */
  drain = 0;
  drainColor: [number, number, number] = [1, 0.3, 0.2];
  /** While colour floods back: world centre and radius in pixels; radius 0 is no flood. */
  flood: [number, number, number] = [0, 0, 0];

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, GRADE_NODE);
  }
}

const LIGHT_NODE = "FilterGuagoLight";
const GRADE_NODE = "FilterGuagoGrade";

class LightNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(LIGHT_NODE, manager, undefined, LIGHT_FRAG);
  }

  override setupTextures(controller: Phaser.Filters.Controller, textures: Texture[]): void {
    const c = controller as LightComposite;
    const fallback = textures[0] as Texture;
    textures[1] = c.light ?? fallback;
    textures[2] = c.rift ?? fallback;
  }

  override setupUniforms(
    controller: Phaser.Filters.Controller,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const c = controller as LightComposite;
    const p = this.programManager;
    p.setUniform("uLight", 1);
    p.setUniform("uRift", 2);
    p.setUniform("uRes", [drawingContext.width, drawingContext.height]);
    p.setUniform("uLightRes", [c.lightW, c.lightH]);
    p.setUniform("uMargin", LIGHT_MARGIN);
    p.setUniform("uScroll", worldScroll(c.camera));
    p.setUniform("uSteps", c.steps);
    p.setUniform("uSharp", c.sharp);
    p.setUniform("uDither", c.dither ? 1 : 0);
    p.setUniform("uRiftRect", c.riftRect);
    p.setUniform("uRiftOn", c.rift ? 1 : 0);
    p.setUniform("uTime", c.time);
    p.setUniform("uHaze", c.haze);
    p.setUniform("uChroma", c.chroma);
    p.setUniform("uAmbient", c.ambient);
  }
}

class GradeNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(GRADE_NODE, manager, undefined, GRADE_FRAG);
  }

  override setupTextures(controller: Phaser.Filters.Controller, textures: Texture[]): void {
    const c = controller as Grade;
    textures[1] = c.lut ?? (textures[0] as Texture);
  }

  override setupUniforms(
    controller: Phaser.Filters.Controller,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const c = controller as Grade;
    const p = this.programManager;
    p.setUniform("uLut", 1);
    p.setUniform("uRes", [drawingContext.width, drawingContext.height]);
    p.setUniform("uScroll", worldScroll(c.camera));
    p.setUniform("uDrain", c.drain);
    p.setUniform("uDrainColor", c.drainColor);
    p.setUniform("uFlood", c.flood);
  }
}

/** Registers both filters' render nodes once per renderer. */
export function registerComposite(scene: Phaser.Scene): void {
  const nodes = (scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer).renderNodes;
  if (!nodes.hasNode(LIGHT_NODE)) nodes.addNodeConstructor(LIGHT_NODE, LightNode);
  if (!nodes.hasNode(GRADE_NODE)) nodes.addNodeConstructor(GRADE_NODE, GradeNode);
}

/** The GL texture behind a texture key. */
export function glTexture(scene: Phaser.Scene, key: string): Texture | null {
  if (!scene.textures.exists(key)) return null;
  return scene.textures.get(key).source[0]?.glTexture ?? null;
}

/** The light composite's banding on the CPU: steps of the light added above the ambient. */
export function bandLight(
  light: readonly [number, number, number],
  ambient: readonly [number, number, number],
  steps: number,
  sharp: number,
): [number, number, number] {
  const extra = light.map((v, i) => v - (ambient[i] as number));
  const peak = Math.max(...extra.map(Math.abs), 0.0001);
  const q = peak * steps;
  const lower = Math.floor(q);
  const t = Math.max(0, Math.min(1, (q - lower - 0.5) * sharp + 0.5));
  const k = (lower + (t >= 0.5 ? 1 : 0)) / steps / peak;
  return [0, 1, 2].map((i) => (ambient[i] as number) + (extra[i] as number) * k) as [
    number,
    number,
    number,
  ];
}
