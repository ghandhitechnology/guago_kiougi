/**
 * The world renderer: what the game scene calls to draw a map.
 *
 * ```ts
 * preload() { loadMap(this, mapId); }                       // map JSON, baked ground, masks, atlases
 * create() {
 *   const view = MapView.create(this, mapId);               // every layer, lit, at the probed tier
 *   view.addEntity(playerSprite, { focus: true });          // Y-sorted, shadowed, lit, cuts overhead away
 *   view.addEntity(monsterSprite);
 *   view.attachLight(playerSprite, { radius: 34, color, intensity: 0.5 });
 *   view.addEffect(sparkSprite);                            // unlit glow layer, additive if the art says so
 * }
 * // Leaving: view.destroy(); unloadMap(this, mapId);
 * ```
 *
 * The view follows `scene.cameras.main` by itself: it reads the camera after the scene's update
 * and draws its light map during the frame, so a following camera never leaves the light a
 * frame behind. Anything the game adds to the scene outside the view (names, damage numbers)
 * draws unlit and ungraded above the world at depth 1 or more.
 */
export { loadAtlases, loadMap, mapExists, unloadMap } from "./assets.ts";
export {
  type EntityOptions,
  type FlashSpec,
  LAYER_NAMES,
  type LayerName,
  type LightHandle,
  type LightingMode,
  type LightSpec,
  MapView,
  type MapViewOptions,
  type RenderStats,
  type TelegraphOptions,
  type VisionCone,
} from "./map-view.ts";
export {
  clearQualityTier,
  onQualityTier,
  probeTier,
  qualityTier,
  setQualityTier,
  TIER_SETTINGS,
  TIERS,
  type Tier,
  type TierSettings,
} from "./tiers.ts";
