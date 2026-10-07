export const artRules = {
  palette: 'Earthy cream, terracotta, leafy greens, restrained teal; warm painted Brazilian ecovila.',
  camera: 'Elevated orthographic 2:1 GAME projection. Ground edges follow (2,1) and (-2,1); verticals upright; no vanishing points.',
  lighting: 'Upper-left light. Preserve readable silhouettes at game scale. Night variants change lighting only and retain exact geometry.',
  output: 'Transparent PNG, generous gutters, no labels or grid. Preserve atlas layout and character identity. No external cast shadows.',
};
export function defaultRecipe(sprite) {
  const references = [sprite.file];
  if (sprite.group !== 'Terrain') references.push('../art/village-atlas-isometric.png');
  if (sprite.name.includes('night')) references.push(sprite.file.replace('-night.png','.png'));
  if (sprite.animation) references.push('../art/residents-cistern.png');
  const layout = sprite.crop ? 'Keep a 3×3 grid: columns lettuce, beans, tomatoes; rows seedling, growing, harvestable. Preserve relative plant sizes.' : sprite.animation || sprite.portrait ? `Keep a 4×4 grid, four frames per activity, consistent foot baselines, face, clothing, and proportions.${sprite.activityAnimation ? ' Rows: stirring a cooking pot, watering with a can, kneeling with a trowel, feeding hens from a basket.' : ''}` : sprite.chicken ? 'Keep three columns of hens and two rows (standing, pecking), preserving each hen’s identity.' : `Keep source crop ${sprite.cell.join(', ')} in the complete source canvas.`;
  const rules = { ...artRules };
  if (sprite.group === 'Terrain') {
    rules.camera = 'Overhead ground surface, exactly two equal square panels side by side: meadow then red earth.';
    rules.lighting = 'Even lighting, low-to-medium contrast, soft painted material texture.';
    rules.output = 'Opaque texture atlas. No objects, horizon, cast shadows, grid, borders or text.';
  }
  if (sprite.name.includes('night')) rules.lighting = 'Cool blue upper-left moonlight with readable shadows. Preserve exact daytime geometry and transparency.';
  return { version:1, asset:sprite.id, subject:sprite.name, rules, references:[...new Set(references)],
    prompt:`Create or revise ${sprite.name}. Match the approved reference images. ${Object.values(rules).join(' ')}\n${layout}\n${sprite.name.includes('night') ? 'Lighting-only edit. Keep exact silhouette, padding and props. Cool moonlight; warm interiors only where inhabited. The coop, compost, garden and cistern have no internal glow.' : ''}`,
    source:'Working brief assembled from the repository art direction; see original prompt records below.', revisions:[] };
}
