import * as THREE from 'three';

const paintedColors = new WeakMap();

export function paintVillageModel(model) {
  model.traverse(mesh => {
    const source = mesh.material;
    if (!source?.isMeshStandardMaterial || source.transparent ||
        source.emissive.getHex() !== 0) return;
    if (!paintedColors.has(source)) {
      const color = source.color.clone().convertLinearToSRGB();
      const {h, s, l} = color.getHSL({});
      if (l < .1) return;
      if (s < .28 && l > .62) color.lerp(new THREE.Color().setRGB(.91, .62, .60), .8);
      else if (s < .18) color.setHSL(.59, .19, l);
      else if (h >= .17 && h < .46) {
        const light = THREE.MathUtils.smoothstep(l, .17, .65);
        color.setHSL(THREE.MathUtils.lerp(.40, .22, light), Math.max(s, .52), l);
      } else if (h < .045 || h > .93) color.setHSL(.035, .6, l);
      else if (h < .13) color.setHSL(.07, Math.min(.8, s * 1.2), l);
      const material = mesh.userData.ownedMaterial ? source : source.clone();
      material.color.copy(color.convertSRGBToLinear());
      material.roughness = Math.max(.9, material.roughness);
      paintedColors.set(source, material);
      paintedColors.set(material, material);
    }
    mesh.material = paintedColors.get(source);
  });
}

export function createPaintedView(renderer) {
  const size = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(1, 1, {
    samples: 4,
    type: THREE.HalfFloatType,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {village: {value: target.texture}, pixel: {value: new THREE.Vector2()}},
    vertexShader: `
      varying vec2 paintUV;
      void main() {
        paintUV = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D village;
      uniform vec2 pixel;
      varying vec2 paintUV;
      void main() {
        vec3 center = texture2D(village, paintUV).rgb;
        vec3 paint = center;
        float total = 1.0;
        // Blend nearby colours within the same brush area, leaving silhouettes sharp.
        for (int x = -1; x <= 1; x += 2) {
          for (int y = -1; y <= 1; y += 2) {
            vec3 nearby = texture2D(village, paintUV + vec2(float(x), float(y)) * pixel).rgb;
            float weight = 0.65 * (1.0 - smoothstep(0.01, 0.11, length(center - nearby)));
            paint += nearby * weight;
            total += weight;
          }
        }
        gl_FragColor = vec4(paint / total, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 weave = cos(gl_FragCoord.xy * 3.14159);
        gl_FragColor.rgb += (grain - 0.5) * 0.028 + weave.x * weave.y * 0.006;
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  return (village, view) => {
    renderer.getDrawingBufferSize(size);
    if (target.width !== size.x || target.height !== size.y) {
      target.setSize(size.x, size.y);
      material.uniforms.pixel.value.set(1.5 / size.x, 1.5 / size.y);
    }
    renderer.setRenderTarget(target);
    renderer.render(village, view);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  };
}
