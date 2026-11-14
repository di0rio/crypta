// Shared GLSL + material patches: procedural surface detail, moss, wind and moving cloud shadows.
// Everything is driven by world position, so terrain, stone, trees and grass agree with each other.

export const shared = { uTime: { value: 0 }, uCloud: { value: 1 }, uFocus: { value: new Float32Array(3) } };

export const NOISE = /* glsl */`
float whash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(whash(i), whash(i + vec2(1.0, 0.0)), f.x), mix(whash(i + vec2(0.0, 1.0)), whash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wfbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * wnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
  return s / 0.9375;
}
float cloudShadow(vec2 xz, float t) { return smoothstep(0.5, 0.72, wfbm(xz * 0.0045 + t * vec2(0.02, 0.008))); }
`;

const HEAD = 'varying vec3 vWPos; varying vec3 vWNor; varying float vLY; uniform float uTime;';

const WPOS = /* glsl */`
  vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = normal;
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4; wn3 = mat3(instanceMatrix) * wn3;
  #endif
  vWPos = (modelMatrix * wp4).xyz; vWNor = normalize(mat3(modelMatrix) * wn3);
`;

const WIND = /* glsl */`
  #ifdef USE_INSTANCING
    float wph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
    float wk = transformed.y * transformed.y * 0.0024;
    transformed.x += (sin(uTime * 1.2 + wph) * 0.6 + sin(uTime * 2.7 + wph * 1.7) * 0.4) * wk;
    transformed.z += cos(uTime * 0.9 + wph) * wk * 0.6;
  #endif
`;

const CLOUD = 'diffuseColor.rgb *= 1.0 - 0.5 * uCloud * cloudShadow(vWPos.xz, uTime);';

// keep the wanderer visible: dither away whatever stands between the camera and the focus point
const SEE = /* glsl */`
    { vec3 ro = cameraPosition, rd = uFocus - ro; float L = length(rd); rd /= L;
      float tt = dot(vWPos - ro, rd);
      if (tt > 0.0 && tt < L - 1.0) {
        float cut = 1.0 - smoothstep(1.5, 3.4, length(vWPos - (ro + rd * tt)));
        if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) < cut * 0.94) discard;
      } }
`;

const FRAG = {
  terrain: /* glsl */`
    float tn1 = wfbm(vWPos.xz * 0.3), tn2 = wnoise(vWPos.xz * 2.1), tn3 = wfbm(vWPos.xz * 0.035);
    diffuseColor.rgb *= 0.84 + 0.2 * tn1 + 0.08 * (tn2 - 0.5) + 0.14 * tn3;
    float steep = 1.0 - smoothstep(0.62, 0.88, vWNor.y);
    float strata = wnoise(vec2(vWPos.y * 0.75 + tn1 * 3.0, vWPos.x * 0.04 + vWPos.z * 0.03));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.62 + 0.62 * strata), steep);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.3, 0.1), steep * smoothstep(0.55, 0.8, tn3) * 0.5 * (1.0 - smoothstep(60.0, 110.0, vWPos.y)));
    ${CLOUD}`,
  stone: /* glsl */`
    float sn = wfbm(vWPos.xz * 0.55 + vWPos.y * 0.37);
    float streak = wnoise(vec2(vWPos.x * 1.3 + vWPos.z * 1.1, vWPos.y * 0.16));
    float grain = wnoise(vWPos.xz * 5.0 + vWPos.y * 4.0);
    diffuseColor.rgb *= (0.55 + 0.75 * sn) * (0.72 + 0.5 * streak) * (0.88 + 0.24 * grain);
    float moss = max(smoothstep(0.5, 0.9, vWNor.y) * smoothstep(0.3, 0.55, wfbm(vWPos.xz * 0.22 + 3.0)), smoothstep(0.55, 0.75, wfbm(vWPos.xz * 0.4 + vWPos.y * 0.5 + 7.0)) * 0.7);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.29, 0.09) * (0.7 + 0.6 * grain), moss * 0.85);
    ${CLOUD}`,
  leaves: /* glsl */`
    diffuseColor.rgb *= mix(0.5, 1.22, smoothstep(1.5, 10.5, vLY)) * (0.82 + 0.36 * wnoise(vWPos.xz * 0.8 + vWPos.y * 0.6));
    ${CLOUD}`,
  plain: CLOUD
};

export function patch(material, kind) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime; sh.uniforms.uCloud = shared.uCloud; sh.uniforms.uFocus = shared.uFocus;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vLY = position.y;\n' + (kind === 'leaves' ? WIND : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + WPOS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAD + ' uniform float uCloud; uniform vec3 uFocus;\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (kind === 'terrain' ? '' : SEE) + FRAG[kind]);
  };
  material.customProgramCacheKey = () => 'ermo-' + kind;
  return material;
}
