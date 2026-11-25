/**
 * Two filters, both at the game's own 480×270 so every effect lands on the art's pixel grid.
 *
 * `LightComposite` sits on the ground layer: it multiplies the ground by the light map and
 * bands the light into a few steps with an ordered dither at the band edges, locked to world
 * pixels so the pattern travels with the ground instead of crawling over it.
 *
 * `Grade` sits on the whole world: it grades every pixel through a palette-aware lookup table,
 * and inside a rift shimmers rows a pixel at a time and splits colour at the torn lip.
 */
import * as Phaser from "phaser";
import { worldScroll } from "./cutaway.ts";

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
uniform vec2 uRes;
uniform vec2 uScroll;
uniform float uSteps;
uniform float uSharp;
uniform float uDither;

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)
${BAYER}

void main () {
  vec4 albedo = texture2D(uMainSampler, outTexCoord);
  if (albedo.a <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 screen = vec2(outTexCoord.x * uRes.x, (1.0 - outTexCoord.y) * uRes.y);
  vec2 world = floor(screen) + uScroll;
  vec3 light = texture2D(uLight, outTexCoord).rgb * 2.0;
  float peak = max(max(light.r, light.g), max(light.b, 0.0001));
  float q = peak * uSteps;
  float lower = floor(q);
  float t = clamp((q - lower - 0.5) * uSharp + 0.5, 0.0, 1.0);
  float d = mix(0.5, bayer4(world) + 0.03125, uDither);
  float stepped = (lower + step(d, t)) / uSteps;
  gl_FragColor = vec4(albedo.rgb * light * (stepped / peak), albedo.a);
}
`;

const GRADE_FRAG = `#pragma phaserTemplate(shaderName)
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D uLut;
uniform sampler2D uRift;
uniform vec2 uRes;
uniform vec2 uScroll;
uniform vec4 uRiftRect;
uniform float uRiftOn;
uniform float uTime;
uniform float uHaze;
uniform float uChroma;

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)

vec3 grade(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  float r = floor(c.r * 31.0 + 0.5);
  float g = floor(c.g * 31.0 + 0.5);
  float b = floor(c.b * 31.0 + 0.5);
  // Canvas textures upload flipped, so the table's rows run upward.
  return texture2D(uLut, vec2((b * 32.0 + r + 0.5) / 1024.0, 1.0 - (g + 0.5) / 32.0)).rgb;
}

void main () {
  vec2 uv = outTexCoord;
  vec2 screen = vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y);
  vec2 world = floor(screen) + uScroll;
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
  vec4 c = texture2D(uMainSampler, uv);
  if (uChroma > 0.0 && rift.y > 0.5) {
    float k = uChroma / uRes.x;
    c.r = texture2D(uMainSampler, uv + vec2(k, 0.0)).r;
    c.b = texture2D(uMainSampler, uv - vec2(k, 0.0)).b;
  }
  if (c.a <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = vec4(grade(c.rgb / c.a) * c.a, c.a);
}
`;

type Texture = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

/** Settings the light composite reads every frame. */
export class LightComposite extends Phaser.Filters.Controller {
  light: Texture | null = null;
  /** Light steps per unit of light: more steps, narrower bands. */
  steps = 4;
  /** How narrow the dithered seam between two bands is: 1 dithers the whole step. */
  sharp = 9;
  dither = true;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, LIGHT_NODE);
  }
}

/** Settings the grade reads every frame. */
export class Grade extends Phaser.Filters.Controller {
  lut: Texture | null = null;
  rift: Texture | null = null;
  riftRect: [number, number, number, number] = [0, 0, 1, 1];
  time = 0;
  haze = 0;
  chroma = 0;

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
    textures[1] = c.light ?? (textures[0] as Texture);
  }

  override setupUniforms(
    controller: Phaser.Filters.Controller,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const c = controller as LightComposite;
    const p = this.programManager;
    p.setUniform("uLight", 1);
    p.setUniform("uRes", [drawingContext.width, drawingContext.height]);
    p.setUniform("uScroll", worldScroll(c.camera));
    p.setUniform("uSteps", c.steps);
    p.setUniform("uSharp", c.sharp);
    p.setUniform("uDither", c.dither ? 1 : 0);
  }
}

class GradeNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(GRADE_NODE, manager, undefined, GRADE_FRAG);
  }

  override setupTextures(controller: Phaser.Filters.Controller, textures: Texture[]): void {
    const c = controller as Grade;
    const fallback = textures[0] as Texture;
    textures[1] = c.lut ?? fallback;
    textures[2] = c.rift ?? fallback;
  }

  override setupUniforms(
    controller: Phaser.Filters.Controller,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const c = controller as Grade;
    const p = this.programManager;
    p.setUniform("uLut", 1);
    p.setUniform("uRift", 2);
    p.setUniform("uRes", [drawingContext.width, drawingContext.height]);
    p.setUniform("uScroll", worldScroll(c.camera));
    p.setUniform("uRiftRect", c.riftRect);
    p.setUniform("uRiftOn", c.rift ? 1 : 0);
    p.setUniform("uTime", c.time);
    p.setUniform("uHaze", c.haze);
    p.setUniform("uChroma", c.chroma);
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

/** The light composite's banding on the CPU, for lighting a whole sprite by one value. */
export function bandLight(
  light: readonly [number, number, number],
  steps: number,
  sharp: number,
): [number, number, number] {
  const peak = Math.max(light[0], light[1], light[2], 0.0001);
  const q = peak * steps;
  const lower = Math.floor(q);
  const t = Math.max(0, Math.min(1, (q - lower - 0.5) * sharp + 0.5));
  const k = (lower + (t >= 0.5 ? 1 : 0)) / steps / peak;
  return [light[0] * k, light[1] * k, light[2] * k];
}
