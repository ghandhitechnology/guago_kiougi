/**
 * Light on sprites, pixel by pixel. A sprite stands on the ground at its feet, so each of its
 * pixels takes the light the ground has in its own column at the feet row: a column at the edge
 * of a pool is lit as a whole, while a run of stands or a long table carries the pool's bands
 * across it exactly as the ground beside it does.
 *
 * Each frame the sprite layers draw once more into a buffer with every sprite filled by a code:
 * its feet row on screen (red and green), and whether it is lit and how deep in ground shadow
 * it stands (blue). The filter on the sprite layers reads the code under each pixel and the light
 * map at that column and row. Glowing pixels and sprites flashing white are coded unlit.
 */
import * as Phaser from "phaser";
import { worldScroll } from "./cutaway.ts";
import { LIGHT_MARGIN } from "./light-field.ts";

const FRAG = `#pragma phaserTemplate(shaderName)
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D uLight;
uniform sampler2D uFeet;
uniform vec2 uRes;
uniform vec2 uLightRes;
uniform float uMargin;
uniform vec2 uScroll;
uniform float uSteps;
uniform float uSharp;
uniform float uDither;
uniform vec3 uShade;
uniform vec3 uRim;
uniform vec2 uSun;
uniform float uRimOn;
uniform vec3 uAmbient;

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main () {
  vec4 c = texture2D(uMainSampler, outTexCoord);
  if (c.a <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 screen = floor(vec2(outTexCoord.x * uRes.x, (1.0 - outTexCoord.y) * uRes.y));
  vec4 f = texture2D(uFeet, outTexCoord);
  float code = floor(f.b * 255.0 + 0.5);
  if (f.a > 0.5 && code < 100.0) {
    gl_FragColor = c;
    return;
  }
  float feet = screen.y;
  float shade = 0.0;
  if (f.a > 0.5) {
    feet = floor(f.r * 255.0 + 0.5) + floor(f.g * 255.0 + 0.5) * 256.0 - uMargin;
    shade = clamp((255.0 - code) / 127.0, 0.0, 1.0);
  }
  vec2 luv = vec2((screen.x + uMargin + 0.5) / uLightRes.x, 1.0 - (feet + uMargin + 0.5) / uLightRes.y);
  vec3 delta = texture2D(uLight, clamp(luv, 0.0, 1.0)).rgb * 2.0 - uAmbient;
  vec3 mag = abs(delta);
  float peak = max(max(mag.r, mag.g), max(mag.b, 0.0001));
  float q = peak * uSteps;
  float lower = floor(q);
  float t = clamp((q - lower - 0.5) * uSharp + 0.5, 0.0, 1.0);
  float d = mix(0.5, bayer4(screen + uScroll) + 0.03125, uDither);
  vec3 light = uAmbient + delta * (((lower + step(d, t)) / uSteps) / peak);
  light *= mix(vec3(1.0), uShade, shade);
  vec3 base = c.rgb / c.a;
  vec3 lit = base * light;
  if (uRimOn > 0.5 && shade < 0.5) {
    // The edge facing a low sun catches it.
    float beside = texture2D(uMainSampler, outTexCoord + vec2(uSun.x / uRes.x, -uSun.y / uRes.y)).a;
    if (beside <= 0.0) lit = mix(lit, max(lit, uRim * max(light.r, light.g)), 0.6);
  }
  gl_FragColor = vec4(lit * c.a, c.a);
}
`;

type Texture = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

export class SpriteLightFilter extends Phaser.Filters.Controller {
  light: Texture | null = null;
  feet: Texture | null = null;
  lightW = 1;
  lightH = 1;
  steps = 4;
  sharp = 9;
  dither = true;
  shade: [number, number, number] = [1, 1, 1];
  rim: [number, number, number] = [1, 1, 1];
  /** Screen direction toward the sun, in whole pixels, when a low sun rims sprites. */
  sun: [number, number] = [-1, 0];
  rimOn = false;
  ambient: [number, number, number] = [1, 1, 1];

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, NODE);
  }
}

const NODE = "FilterGuagoSpriteLight";

class SpriteLightNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(NODE, manager, undefined, FRAG);
  }

  override setupTextures(controller: Phaser.Filters.Controller, textures: Texture[]): void {
    const c = controller as SpriteLightFilter;
    const fallback = textures[0] as Texture;
    textures[1] = c.light ?? fallback;
    textures[2] = c.feet ?? fallback;
  }

  override setupUniforms(
    controller: Phaser.Filters.Controller,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const c = controller as SpriteLightFilter;
    const p = this.programManager;
    p.setUniform("uLight", 1);
    p.setUniform("uFeet", 2);
    p.setUniform("uRes", [drawingContext.width, drawingContext.height]);
    p.setUniform("uLightRes", [c.lightW, c.lightH]);
    p.setUniform("uMargin", LIGHT_MARGIN);
    p.setUniform("uScroll", worldScroll(c.camera));
    p.setUniform("uSteps", c.steps);
    p.setUniform("uSharp", c.sharp);
    p.setUniform("uDither", c.dither ? 1 : 0);
    p.setUniform("uShade", c.shade);
    p.setUniform("uRim", c.rim);
    p.setUniform("uSun", c.sun);
    p.setUniform("uRimOn", c.rimOn ? 1 : 0);
    p.setUniform("uAmbient", c.ambient);
  }
}

export function registerSpriteLight(scene: Phaser.Scene): void {
  const nodes = (scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer).renderNodes;
  if (!nodes.hasNode(NODE)) nodes.addNodeConstructor(NODE, SpriteLightNode);
}

type Tintable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Tint &
  Phaser.GameObjects.Components.AlphaSingle &
  Phaser.GameObjects.Components.Visible & { y: number };

function tintable(o: Phaser.GameObjects.GameObject): o is Tintable {
  return "setTintMode" in o && "tintTopLeft" in o && "y" in o;
}

/** How one sprite is coded: its feet in the world, whether it is lit, its shade there. */
export interface SpriteCode {
  readonly feetY: number;
  readonly unlit: boolean;
  readonly shade: number;
}

interface Saved {
  obj: Tintable;
  mode: Phaser.TintModes;
  tl: number;
  tr: number;
  bl: number;
  br: number;
  alpha: number;
}

/** The buffer of feet codes, drawn each frame from the sprite layers. */
export class FeetBuffer {
  readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly saved: Saved[] = [];
  private readonly hiddenNow: Phaser.GameObjects.Components.Visible[] = [];

  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly layers: readonly Phaser.GameObjects.Layer[];
  private readonly code: (obj: Phaser.GameObjects.GameObject) => SpriteCode;

  constructor(
    scene: Phaser.Scene,
    camera: Phaser.Cameras.Scene2D.Camera,
    layers: readonly Phaser.GameObjects.Layer[],
    code: (obj: Phaser.GameObjects.GameObject) => SpriteCode,
  ) {
    this.camera = camera;
    this.layers = layers;
    this.code = code;
    this.rt = scene.add
      .renderTexture(0, 0, camera.width, camera.height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setRenderMode("redraw")
      .setDepth(-999);
  }

  get texture(): Texture | null {
    return (this.rt.texture as Phaser.Textures.DynamicTexture).getWebGLTexture();
  }

  /** Queues this frame's buffer: drawn during the frame, after the camera has moved. */
  queue(): void {
    const rt = this.rt;
    rt.clear();
    rt.callback(() => this.encode());
    for (const layer of this.layers) if (layer.visible) rt.capture(layer, { camera: this.camera });
    rt.callback(() => this.restore());
  }

  private encode(): void {
    const sy = worldScroll(this.camera)[1];
    this.saved.length = 0;
    this.hiddenNow.length = 0;
    for (const layer of this.layers) {
      for (const obj of layer.getChildren()) {
        if (!tintable(obj)) {
          const v = obj as unknown as Phaser.GameObjects.Components.Visible;
          if (typeof v.setVisible === "function" && v.visible) {
            v.setVisible(false);
            this.hiddenNow.push(v);
          }
          continue;
        }
        if (!obj.visible) continue;
        const c = this.code(obj);
        const unlit = c.unlit || obj.tintMode !== Phaser.TintModes.MULTIPLY;
        const feet = Math.max(0, Math.min(65535, Math.round(c.feetY - sy) + LIGHT_MARGIN));
        const blue = unlit ? 64 : 128 + Math.round(127 * (1 - Math.max(0, Math.min(1, c.shade))));
        this.saved.push({
          obj,
          mode: obj.tintMode,
          tl: obj.tintTopLeft,
          tr: obj.tintTopRight,
          bl: obj.tintBottomLeft,
          br: obj.tintBottomRight,
          alpha: obj.alpha,
        });
        obj.setTintMode(Phaser.TintModes.FILL);
        obj.setTint(((feet & 255) << 16) | (((feet >> 8) & 255) << 8) | blue);
        obj.setAlpha(1);
      }
    }
  }

  private restore(): void {
    for (const s of this.saved) {
      s.obj.setTintMode(s.mode);
      s.obj.setTint(s.tl, s.tr, s.bl, s.br);
      s.obj.setAlpha(s.alpha);
    }
    for (const v of this.hiddenNow) v.setVisible(true);
    this.saved.length = 0;
    this.hiddenNow.length = 0;
  }

  destroy(): void {
    this.rt.destroy();
  }
}
