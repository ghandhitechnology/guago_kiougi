/**
 * The filter on the overhead and foliage layers: where the player stands behind a crown, a roof
 * or a capital, a hole opens around them, solid at the centre and dithered at its rim, on world
 * pixels. On the foliage layer it also waves leaves a whole pixel at a time.
 */
import * as Phaser from "phaser";

const FRAG = `#pragma phaserTemplate(shaderName)
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uRes;
uniform vec2 uScroll;
uniform vec2 uFocus;
uniform float uRadius;
uniform float uCut;
uniform float uWobble;
uniform float uTime;

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
  vec2 uv = outTexCoord;
  vec2 screen = vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y);
  vec2 world = floor(screen) + uScroll;
  if (uWobble > 0.5) {
    float gust = 0.6 + 0.4 * sin(uTime * 0.37 + world.x * 0.004);
    float w = sin(world.y * 0.29 + uTime * 2.1 + floor(world.x / 19.0) * 1.9) * gust;
    uv.x += floor(w * 1.15 + 0.5) / uRes.x;
  }
  vec4 c = texture2D(uMainSampler, uv);
  if (uCut > 0.5) {
    vec2 d = (world + 0.5 - uFocus) / vec2(uRadius, uRadius * 1.3);
    float keep = clamp((length(d) - 0.55) / 0.45, 0.0, 1.0);
    if (bayer4(world) + 0.03 > keep) c = vec4(0.0);
  }
  gl_FragColor = c;
}
`;

const NODE = "FilterGuagoCutaway";

export class Cutaway extends Phaser.Filters.Controller {
  /** The point the hole centres on, in world pixels. */
  focusX = -1e5;
  focusY = -1e5;
  radius = 20;
  /** 1 opens the hole. */
  cut = 0;
  /** 1 waves the layer's pixels. */
  wobble = 0;
  time = 0;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, NODE);
  }
}

class CutawayNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(NODE, manager, undefined, FRAG);
  }

  override setupUniforms(
    controller: Phaser.Filters.Controller,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const c = controller as Cutaway;
    const p = this.programManager;
    p.setUniform("uRes", [drawingContext.width, drawingContext.height]);
    p.setUniform("uScroll", worldScroll(c.camera));
    p.setUniform("uFocus", [c.focusX, c.focusY]);
    p.setUniform("uRadius", c.radius);
    p.setUniform("uCut", c.cut);
    p.setUniform("uWobble", c.wobble);
    p.setUniform("uTime", c.time);
  }
}

/**
 * The whole-pixel scroll the camera draws the world at: a vertex at world x lands on screen
 * pixel `round(x − scrollX)`, which for whole x is `x + round(−scrollX)`.
 */
export function worldScroll(camera: Phaser.Cameras.Scene2D.Camera): [number, number] {
  return [-Math.round(-camera.scrollX), -Math.round(-camera.scrollY)];
}

export function registerCutaway(scene: Phaser.Scene): void {
  const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer.renderNodes.hasNode(NODE))
    renderer.renderNodes.addNodeConstructor(NODE, CutawayNode);
}
