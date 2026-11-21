import * as THREE from 'three';

const paintedColors = new WeakMap();

function applyMatteFinish(material) {
  material.roughness = Math.max(.92, material.roughness);
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${cacheKey}|village-matte`;
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 paintWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 paintPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          paintPosition = instanceMatrix * paintPosition;
        #endif
        paintWorld = (modelMatrix * paintPosition).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 paintWorld;
        float paintHash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(.11, .29, .41));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float paintNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(paintHash(i), paintHash(i + vec3(1,0,0)), f.x),
                mix(paintHash(i + vec3(0,1,0)), paintHash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(paintHash(i + vec3(0,0,1)), paintHash(i + vec3(1,0,1)), f.x),
                mix(paintHash(i + vec3(0,1,1)), paintHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wash = smoothstep(.22, .78, paintNoise(paintWorld * .65));
        float tooth = paintNoise(paintWorld * 3.0) - .5;
        tooth *= 1.0 - smoothstep(.10, .40, length(fwidth(paintWorld)));
        diffuseColor.rgb *= mix(vec3(.84,.77,.77), vec3(1.13,1.13,1.18), wash) + tooth * .07;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        // Use broad, soft bands in diffuse light while retaining light colour.
        float lit = dot(reflectedLight.directDiffuse, vec3(.2126,.7152,.0722));
        float base = max(dot(diffuseColor.rgb, vec3(.2126,.7152,.0722)), .015);
        float level = lit / base;
        float bands = .20 * smoothstep(.07,.19,level)
                    + .28 * smoothstep(.27,.42,level)
                    + .40 * smoothstep(.54,.76,level)
                    + max(0.0, level - .88);
        reflectedLight.directDiffuse *= mix(1.0, bands / max(level, .001), .53);
        reflectedLight.directSpecular *= .22;
        reflectedLight.indirectSpecular *= .45;`);
  };
}

export function paintVillageModel(model) {
  model.traverse(mesh => {
    const source = mesh.material;
    if (!source?.isMeshStandardMaterial || source.transparent || source.userData.windowPane ||
        source.emissive.getHex() !== 0) return;
    if (!paintedColors.has(source)) {
      const color = source.color.clone().convertLinearToSRGB();
      const {h, s, l} = color.getHSL({});
      if (l >= .1) {
        if (s < .28 && l > .62) color.lerp(new THREE.Color().setRGB(.91, .62, .60), .8);
        else if (s < .18) color.setHSL(.59, .19, l);
        else if (h >= .17 && h < .46) {
          const light = THREE.MathUtils.smoothstep(l, .17, .65);
          color.setHSL(THREE.MathUtils.lerp(.40, .22, light), Math.max(s, .52), l);
        } else if (h < .045 || h > .93) color.setHSL(.035, .6, l);
        else if (h < .13) color.setHSL(.07, Math.min(.8, s * 1.2), l);
      }
      const material = mesh.userData.ownedMaterial ? source : source.clone();
      material.color.copy(color.convertSRGBToLinear());
      applyMatteFinish(material);
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
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
  });
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      village: {value: target.texture}, pixel: {value: new THREE.Vector2()},
      glow: {value: 0}, brush: {value: 1},
      villageDepth: {value: target.depthTexture}, depthRange: {value: 1},
      contactRadius: {value: 1}, shadowTint: {value: new THREE.Color()},
    },
    vertexShader: `
      varying vec2 paintUV;
      void main() {
        paintUV = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D village, villageDepth;
      uniform vec2 pixel;
      uniform float glow, brush, depthRange, contactRadius;
      uniform vec3 shadowTint;
      varying vec2 paintUV;
      void main() {
        vec3 center = texture2D(village, paintUV).rgb;
        vec3 paint = center;
        float total = 1.0;
        float centerDepth = texture2D(villageDepth, paintUV).r;
        float occlusion = 0.0;
        // Opposite samples cancel the depth gradient of an uninterrupted slope.
        // A nearby surface in front of that slope leaves a positive residual.
        for (int i = 0; i < 4; i++) {
          float angle = float(i) * 0.785398;
          vec2 direction = vec2(cos(angle), sin(angle));
          vec2 offset = direction * pixel * contactRadius;
          float front = (centerDepth - texture2D(villageDepth, paintUV + offset).r) * depthRange;
          float back = (centerDepth - texture2D(villageDepth, paintUV - offset).r) * depthRange;
          float nearest = max(front, back);
          float crease = smoothstep(.25, .85, front + back);
          occlusion += crease * (1.0 - smoothstep(1.05, 2.1, nearest));

          // Balance the filter across both screen axes.
          offset = vec2(cos(angle * 2.0), sin(angle * 2.0)) * pixel * brush;
          vec3 nearby = texture2D(village, paintUV + offset).rgb;
          float depthChange = abs(centerDepth - texture2D(villageDepth, paintUV + offset).r) * depthRange;
          float colorChange = length(center - nearby);
          float weight = .8 * (1.0 - smoothstep(.09, .34, depthChange))
                            * (1.0 - smoothstep(.025, .17, colorChange));
          paint += nearby * weight;
          total += weight;
        }
        vec3 painted = paint / total;
        if (centerDepth < .99999) {
          painted *= mix(vec3(1.0), shadowTint, clamp(occlusion * .13, 0.0, .38));
        }
        vec3 halo = vec3(0.0);
        if (glow > 0.0) {
          for (int i = 0; i < 8; i++) {
            float angle = float(i) * 0.785398;
            vec2 direction = vec2(cos(angle), sin(angle));
            vec3 highlight = texture2D(village, paintUV + direction * pixel * 8.0).rgb;
            halo += max(highlight - vec3(0.75), 0.0);
          }
        }
        gl_FragColor = vec4(painted + halo * glow / 8.0, 1.0);
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

  return (village, view, treatment) => {
    material.uniforms.glow.value = treatment?.bloom ?? 0;
    material.uniforms.brush.value = (treatment?.paint ?? 1) * THREE.MathUtils.clamp(1.55 - view.zoom * .43, .8, 1.5);
    material.uniforms.depthRange.value = view.far - view.near;
    material.uniforms.shadowTint.value.copy(treatment.shadowTint);
    renderer.getDrawingBufferSize(size);
    if (target.width !== size.x || target.height !== size.y) {
      target.setSize(size.x, size.y);
      material.uniforms.pixel.value.set(1.5 / size.x, 1.5 / size.y);
    }
    const pixelsPerMetre = size.y * view.zoom / (view.top - view.bottom);
    material.uniforms.contactRadius.value = THREE.MathUtils.clamp(pixelsPerMetre * .45, 1.5, 8);
    renderer.setRenderTarget(target);
    renderer.render(village, view);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  };
}
