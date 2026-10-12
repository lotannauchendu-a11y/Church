// ---------------------------------------------------------------------------
// Math helpers + WebGL2 renderer.
// All world geometry is drawn camera-relative to keep float precision.
// ---------------------------------------------------------------------------
const M4 = {
  ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, out) {
    const o = out || new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  persp(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = (2 * far * near) / (near - far);
    return m;
  },
  // rotation-only view matrix from basis vectors
  viewRot(r, u, f) {
    return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, 0, 0, 0, 1]);
  },
  trs(tx, ty, tz, ry, rx, sx, sy, sz) {
    // T * Ry * Rx * S
    const cy = Math.cos(ry), syv = Math.sin(ry), cx = Math.cos(rx), sxv = Math.sin(rx);
    return new Float32Array([
      cy * sx, 0, -syv * sx, 0,
      syv * sxv * sy, cx * sy, cy * sxv * sy, 0,
      syv * cx * sz, -sxv * sz, cy * cx * sz, 0,
      tx, ty, tz, 1,
    ]);
  },
  translate(m, x, y, z) { const t = M4.ident(); t[12] = x; t[13] = y; t[14] = z; return M4.mul(m, t); },
  rotY(m, a) { const c = Math.cos(a), s = Math.sin(a); const r = new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); return M4.mul(m, r); },
  rotX(m, a) { const c = Math.cos(a), s = Math.sin(a); const r = new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); return M4.mul(m, r); },
  rotZ(m, a) { const c = Math.cos(a), s = Math.sin(a); const r = new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); return M4.mul(m, r); },
  scale(m, x, y, z) { const t = M4.ident(); t[0] = x; t[5] = y; t[10] = z; return M4.mul(m, t); },
};
const V3 = {
  norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; },
  cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
  scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; },
};

const CLOUD_Y = 158;

// Sharp-pixel sampling: crisp texel edges up close (antialiased over one screen pixel),
// regular trilinear/anisotropic filtering in the distance.
const GLSL_TEXPIX = `
vec4 texPix(sampler2DArray tex, vec3 uvw) {
  vec2 uv = uvw.xy * 16.0;
  vec2 dx = dFdx(uvw.xy), dy = dFdy(uvw.xy);
  vec2 fw = max(abs(dx) + abs(dy), vec2(1e-6)) * 16.0;
  vec2 seam = floor(uv + 0.5);
  uv = seam + clamp((uv - seam) / fw, -0.5, 0.5);
  return textureGrad(tex, vec3(uv / 16.0, uvw.z), dx, dy);
}
`;
const GLSL_COMMON = `
uniform vec3 uSunDir;
uniform vec3 uLightDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform float uTime;
uniform vec3 uCamPos;
uniform float uExposure;
uniform float uCloudCover;
vec3 skyColor(vec3 dir) {
  float y = dir.y;
  float h = 1.0 - clamp(y, 0.0, 1.0);
  vec3 col = mix(uZenith, uHorizon, pow(h, 4.0));
  col = mix(col, uHorizon * 0.7, smoothstep(0.0, -0.35, y));
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunGlow * (pow(sd, 5.0) * 0.32 + pow(sd, 48.0) * 0.6) * (1.0 - 0.7 * clamp(y, 0.0, 1.0));
  return col;
}
vec3 tonemap(vec3 c) {
  c *= uExposure;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = clamp(c, 0.0, 1.0);
  c = clamp(mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.07), 0.0, 1.0);
  return pow(c, vec3(1.0 / 2.2));
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cloudDensity(vec2 p, int oct) {
  p = p * 0.0052 + vec2(uTime * 0.0045, uTime * 0.0017);
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; }
  s /= n;
  return smoothstep(0.62 - uCloudCover * 0.22, 0.86 - uCloudCover * 0.12, s);
}
`;

const CHUNK_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in uvec3 aD;
uniform mat4 uVP;
uniform mat4 uShadowVP;
uniform vec3 uOrigin;
uniform vec3 uChunkWorld;
uniform float uTime;
uniform float uWind;
out vec3 vUV;
out vec3 vRel;
out vec3 vN;
out float vAO;
out vec2 vLight;
out vec4 vShadow;
out vec3 vTint;
out float vTintOn;
out float vGlow;
flat out int vFace;
const vec3 NORMALS[6] = vec3[6](vec3(1.0,0.0,0.0), vec3(-1.0,0.0,0.0), vec3(0.0,1.0,0.0), vec3(0.0,-1.0,0.0), vec3(0.0,0.0,1.0), vec3(0.0,0.0,-1.0));
float waterWave(vec2 p) { return (sin(p.x * 0.9 + uTime * 1.6) + sin(p.y * 0.7 + uTime * 1.3 + p.x * 0.3)) * 0.022 - 0.05; }
void main() {
  uint w0 = aD.x, w1 = aD.y, w2 = aD.z;
  vec3 p = vec3(float(w0 & 511u), float((w0 >> 18u) & 4095u), float((w0 >> 9u) & 511u)) / 16.0;
  uint face = (w1 >> 8u) & 7u;
  vec2 uv = vec2(float((w1 >> 11u) & 31u), float((w1 >> 16u) & 31u)) / 16.0;
  uint wave = (w1 >> 23u) & 3u;
  vec3 world = uChunkWorld + p;
  if (wave == 1u) {
    float t = uTime * 1.7;
    p.x += sin(world.x * 1.7 + world.y * 0.9 + t) * 0.03 * uWind;
    p.z += cos(world.z * 1.3 + world.y * 1.1 + t * 1.2) * 0.03 * uWind;
  } else if (wave == 2u) {
    float t = uTime * 2.1;
    p.x += sin(world.x * 0.9 + world.z * 0.5 + t) * 0.08 * uWind;
    p.z += cos(world.z * 0.8 + world.x * 0.4 + t * 1.3) * 0.06 * uWind;
  } else if (wave == 3u) {
    p.y += waterWave(world.xz);
  }
  vec3 rel = uOrigin + p;
  vec3 n = NORMALS[face];
  vUV = vec3(uv, float(w1 & 255u));
  vRel = rel;
  vN = n;
  vFace = int(face);
  vAO = float((w1 >> 21u) & 3u);
  vGlow = float((w1 >> 25u) & 1u);
  vLight = vec2(float(w2 & 63u), float((w2 >> 6u) & 63u)) / 60.0;
  uint t = (w2 >> 12u) & 32767u;
  vTint = vec3(float(t & 31u), float((t >> 5u) & 31u), float((t >> 10u) & 31u)) / 31.0;
  vTintOn = t > 0u ? 1.0 : 0.0;
  vShadow = uShadowVP * vec4(rel + n * 0.045, 1.0);
  gl_Position = uVP * vec4(rel, 1.0);
}`;

const CHUNK_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
precision highp sampler2DShadow;
in vec3 vUV;
in vec3 vRel;
in vec3 vN;
in float vAO;
in vec2 vLight;
in vec4 vShadow;
in vec3 vTint;
in float vTintOn;
in float vGlow;
flat in int vFace;
uniform sampler2DArray uTex;
uniform sampler2DShadow uShadowMap;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uTorch;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform float uFogNear;
uniform float uFogFar;
uniform int uUnderwater;
uniform vec3 uWaterFog;
uniform int uLavaLayer;
out vec4 outColor;
${GLSL_COMMON}
${GLSL_TEXPIX}
float shadowAt(vec4 sp, float ndl) {
  vec3 c = sp.xyz / sp.w * 0.5 + 0.5;
  if (c.x <= 0.0 || c.y <= 0.0 || c.x >= 1.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float bias = 0.00035 + 0.0009 * (1.0 - ndl);
  float z = c.z - bias;
  float o = uShadowTexel;
  float s = texture(uShadowMap, vec3(c.xy + vec2(-0.6, -0.6) * o, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.6, -0.6) * o, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(-0.6, 0.6) * o, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.6, 0.6) * o, z));
  s *= 0.25;
  vec2 e = abs(c.xy - 0.5) * 2.0;
  return mix(s, 1.0, smoothstep(0.82, 0.98, max(e.x, e.y)));
}
void main() {
  vec3 uvw = vUV;
  if (int(vUV.z + 0.5) == uLavaLayer) uvw.xy += vec2(uTime * 0.02, sin(uTime * 0.3) * 0.05);
  vec4 tex = texPix(uTex, uvw);
  if (tex.a < 0.5) discard;
  vec3 alb = pow(tex.rgb, vec3(2.2));
  if (vTintOn > 0.5) {
    float mx = max(max(tex.r, tex.g), tex.b), mn = min(min(tex.r, tex.g), tex.b);
    float t = 1.0 - smoothstep(0.08, 0.2, mx - mn);
    alb *= mix(vec3(1.0), pow(vTint, vec3(2.2)) * 1.08, t);
  }
  vec3 world = vRel + uCamPos;
  float sky = vLight.x, blk = vLight.y;
  float skyL = sky * sky * (0.35 + 0.65 * sky);
  float blkL = blk * blk * (0.4 + 0.6 * blk);
  float ndl = dot(vN, uLightDir);
  float sh = 0.0;
  float exposure = smoothstep(0.5, 0.94, sky);
  if (ndl > 0.0 && exposure > 0.0) {
    sh = uShadowOn > 0.5 ? shadowAt(vShadow, ndl) : 1.0;
    float ly = max(uLightDir.y, 0.08);
    float cloud = cloudDensity(world.xz + uLightDir.xz / ly * (${CLOUD_Y.toFixed(1)} - world.y), 3);
    sh *= 1.0 - cloud * 0.6;
  }
  float aoF = 0.38 + vAO * 0.2066;
  float faceShade = vFace == 2 ? 1.0 : (vFace == 3 ? 0.5 : (vFace < 2 ? 0.74 : 0.86));
  vec3 ambient = uAmbient * skyL * faceShade + vec3(0.010, 0.010, 0.014);
  float flick = 0.93 + 0.07 * sin(uTime * 7.0 + world.x * 0.7 + world.z * 1.3) * sin(uTime * 11.3 + world.y);
  vec3 torch = uTorch * blkL * flick;
  vec3 direct = uLightColor * max(ndl, 0.0) * sh * exposure;
  vec3 light = (ambient + torch * faceShade) * aoF + direct * (0.6 + 0.4 * aoF);
  vec3 col = alb * light;
  if (vGlow > 0.5) col = max(col, alb * 1.25);
  float dist = length(vRel);
  vec3 V = vRel / max(dist, 0.001);
  float fog;
  vec3 fogC;
  if (uUnderwater == 1) { fog = 1.0 - exp(-dist * 0.075); fogC = uWaterFog; }
  else if (uUnderwater == 2) { fog = 1.0 - exp(-dist * 0.6); fogC = vec3(0.6, 0.12, 0.0); }
  else {
    fog = smoothstep(uFogNear, uFogFar, length(vRel.xz));
    fog = max(fog, 1.0 - exp(-dist * 0.0006));
    fogC = skyColor(V);
  }
  col = mix(col, fogC, fog);
  outColor = vec4(tonemap(col), 1.0);
}`;

const WATER_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
precision highp sampler2DShadow;
in vec3 vUV;
in vec3 vRel;
in vec3 vN;
in float vAO;
in vec2 vLight;
in vec4 vShadow;
in vec3 vTint;
in float vTintOn;
in float vGlow;
flat in int vFace;
uniform sampler2DArray uTex;
uniform sampler2DShadow uShadowMap;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uTorch;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform float uFogNear;
uniform float uFogFar;
uniform int uUnderwater;
uniform vec3 uWaterFog;
uniform int uWaterLayer;
out vec4 outColor;
${GLSL_COMMON}
float shadowAt(vec4 sp) {
  vec3 c = sp.xyz / sp.w * 0.5 + 0.5;
  if (c.x <= 0.0 || c.y <= 0.0 || c.x >= 1.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  return texture(uShadowMap, vec3(c.xy, c.z - 0.0008));
}
void main() {
  vec4 tex = texture(uTex, vUV);
  vec3 world = vRel + uCamPos;
  float sky = vLight.x, blk = vLight.y;
  float skyL = sky * sky * (0.35 + 0.65 * sky);
  float blkL = blk * blk * (0.4 + 0.6 * blk);
  float exposure = smoothstep(0.5, 0.94, sky);
  float sh = uShadowOn > 0.5 ? shadowAt(vShadow) : 1.0;
  float dist = length(vRel);
  vec3 V = -vRel / max(dist, 0.001);
  vec3 col;
  float alpha;
  bool isWater = int(vUV.z + 0.5) == uWaterLayer;
  if (isWater) {
    vec3 N = vN;
    if (vFace == 2) {
      vec2 p = world.xz;
      float t = uTime;
      vec2 g = vec2(0.9 * cos(p.x * 0.9 + t * 1.6) * 0.022 + 0.3 * 0.022 * cos(p.y * 0.7 + t * 1.3 + p.x * 0.3),
                    0.7 * 0.022 * cos(p.y * 0.7 + t * 1.3 + p.x * 0.3));
      float near = 1.0 - smoothstep(12.0, 48.0, dist);
      g += vec2(cos(p.x * 3.7 + p.y * 1.9 + t * 2.6), cos(p.y * 4.1 - p.x * 1.3 + t * 2.2)) * 0.018 * (0.35 + 0.65 * near);
      g += vec2(cos(p.x * 7.3 - p.y * 5.1 - t * 3.1), cos(p.y * 8.9 + p.x * 3.7 + t * 3.4)) * 0.008 * near;
      N = normalize(vec3(-g.x * 2.0, 1.0, -g.y * 2.0));
    }
    if (dot(N, V) < 0.0) N = -N;
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);
    vec3 refl = skyColor(R) * mix(0.12, 1.0, skyL);
    vec3 body = pow(tex.rgb, vec3(2.2)) * vec3(0.55, 0.75, 0.95);
    vec3 lit = uAmbient * skyL + uTorch * blkL + uLightColor * max(dot(N, uLightDir), 0.0) * sh * exposure * 0.6;
    body *= lit;
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 220.0) * 3.0 * sh * exposure * (1.0 - smoothstep(40.0, 110.0, dist));
    col = mix(body, refl, fres * 0.85) + uLightColor * spec;
    alpha = vFace == 2 ? mix(0.6, 0.94, fres) : 0.72;
    if (uUnderwater == 1) alpha = 0.55;
  } else {
    vec3 alb = pow(tex.rgb, vec3(2.2));
    float ndl = max(dot(vN, uLightDir), 0.0);
    float faceShade = vFace == 2 ? 1.0 : (vFace == 3 ? 0.5 : 0.8);
    vec3 light = uAmbient * skyL * faceShade + uTorch * blkL + uLightColor * ndl * sh * exposure * 0.7;
    col = alb * light;
    float fres = pow(1.0 - max(dot(vN, V), 0.0), 4.0);
    col = mix(col, skyColor(reflect(-V, vN)) * skyL, fres * 0.5);
    alpha = tex.a;
  }
  float fog;
  vec3 fogC;
  if (uUnderwater == 1) { fog = 1.0 - exp(-dist * 0.075); fogC = uWaterFog; }
  else {
    fog = smoothstep(uFogNear, uFogFar, length(vRel.xz));
    fog = max(fog, 1.0 - exp(-dist * 0.0006));
    fogC = skyColor(-V);
  }
  col = mix(col, fogC, fog);
  outColor = vec4(tonemap(col), alpha);
}`;

const SHADOW_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vUV;
uniform sampler2DArray uTex;
out vec4 outColor;
${GLSL_TEXPIX}
void main() { if (texPix(uTex, vUV).a < 0.5) discard; outColor = vec4(1.0); }`;

const SKY_VS = `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.9999, 1.0);
}`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uTanHalf;
uniform float uNight;
uniform vec3 uCloudColor;
uniform vec3 uSunDisc;
uniform int uUnderwater;
uniform vec3 uWaterFog;
out vec4 outColor;
${GLSL_COMMON}
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 dir = normalize(uFwd + vNdc.x * uTanHalf.x * uRight + vNdc.y * uTanHalf.y * uUp);
  if (uUnderwater == 1) { outColor = vec4(tonemap(uWaterFog), 1.0); return; }
  vec3 col = skyColor(dir);
  if (uNight > 0.01 && dir.y > -0.05) {
    vec3 d = dir * 260.0;
    vec3 cell = floor(d);
    float h = hash13(cell);
    if (h > 0.9965) {
      vec3 f = fract(d) - 0.5;
      float tw = 0.55 + 0.45 * sin(uTime * (2.0 + h * 5.0) + h * 300.0);
      float s = smoothstep(0.32, 0.0, length(f));
      col += vec3(0.9, 0.95, 1.0) * s * tw * uNight * 1.6 * smoothstep(-0.05, 0.25, dir.y);
    }
  }
  float sd = dot(dir, uSunDir);
  col += uSunDisc * smoothstep(0.99935, 0.99965, sd) * 14.0;
  col += uSunDisc * pow(max(sd, 0.0), 900.0) * 3.0;
  vec3 moonDir = -uSunDir;
  float md = dot(dir, moonDir);
  if (md > 0.9985) {
    vec3 mr = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)));
    vec3 mu = cross(mr, moonDir);
    vec2 mp = vec2(dot(dir, mr), dot(dir, mu)) * 900.0;
    float crater = vnoise(mp * 0.45 + 3.0) * 0.5 + vnoise(mp * 1.1) * 0.3;
    float disc = smoothstep(0.99925, 0.9995, md);
    col = mix(col, vec3(0.95, 0.96, 1.0) * (0.75 + crater * 0.5) * 1.4, disc);
    col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 2000.0) * 0.6 * uNight;
  }
  if (dir.y > 0.0) {
    float t = (${CLOUD_Y.toFixed(1)} - uCamPos.y) / dir.y;
    if (t > 0.0) {
      vec2 p = uCamPos.xz + dir.xz * t;
      float dens = cloudDensity(p, 5);
      if (dens > 0.0) {
        float self = cloudDensity(p + uSunDir.xz * 18.0, 3);
        vec3 c = uCloudColor * (1.0 - self * 0.4) + uSunGlow * pow(max(dot(dir, uSunDir), 0.0), 6.0) * 0.5;
        float fade = exp(-t * 0.0011) * smoothstep(0.02, 0.16, dir.y);
        col = mix(col, c, dens * fade * 0.94);
      }
    }
  }
  outColor = vec4(tonemap(col), 1.0);
}`;

const ENT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in float aFace;
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec3 uSize;
uniform float uTile;
uniform int uLayers[6];
uniform vec4 uUVRect;
out vec3 vUV;
out vec3 vN;
out vec3 vRel;
void main() {
  int f = int(aFace + 0.5);
  vec2 dims = f < 2 ? uSize.zy : (f < 4 ? uSize.xz : uSize.xy);
  vec2 uv = mix(aUV, aUV * dims, uTile);
  uv = uUVRect.xy + uv * uUVRect.zw;
  vUV = vec3(uv, float(uLayers[f]));
  vec4 wp = uModel * vec4(aPos, 1.0);
  vRel = wp.xyz;
  vN = normalize(mat3(uModel) * aNormal);
  gl_Position = uVP * wp;
}`;
const ENT_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vUV;
in vec3 vN;
in vec3 vRel;
uniform sampler2DArray uTex;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uTorch;
uniform vec2 uLight;
uniform vec4 uColor;
uniform vec3 uFlash;
uniform float uFogNear;
uniform float uFogFar;
uniform int uUnderwater;
uniform vec3 uWaterFog;
uniform float uUnlit;
uniform vec4 uTint;
out vec4 outColor;
${GLSL_COMMON}
${GLSL_TEXPIX}
void main() {
  vec4 t = texPix(uTex, vUV);
  if (t.a < 0.1) discard;
  vec3 alb = pow(t.rgb, vec3(2.2)) * uColor.rgb;
  if (uTint.a > 0.5) {
    float mx = max(max(t.r, t.g), t.b), mn = min(min(t.r, t.g), t.b);
    alb *= mix(vec3(1.0), pow(uTint.rgb, vec3(2.2)) * 1.08, 1.0 - smoothstep(0.08, 0.2, mx - mn));
  }
  float sky = uLight.x, blk = uLight.y;
  float skyL = sky * sky * (0.35 + 0.65 * sky);
  float blkL = blk * blk * (0.4 + 0.6 * blk);
  float ndl = max(dot(vN, uLightDir), 0.0);
  float fs = 0.75 + 0.25 * vN.y;
  vec3 light = uAmbient * skyL * fs + uTorch * blkL + uLightColor * ndl * smoothstep(0.5, 0.94, sky) * 0.85 + vec3(0.012);
  vec3 col = mix(alb * light, alb, uUnlit) + uFlash;
  float dist = length(vRel);
  float fog;
  vec3 fogC;
  if (uUnderwater == 1) { fog = 1.0 - exp(-dist * 0.075); fogC = uWaterFog; }
  else { fog = max(smoothstep(uFogNear, uFogFar, length(vRel.xz)), 1.0 - exp(-dist * 0.0006)); fogC = skyColor(vRel / max(dist, 0.001)); }
  col = mix(col, fogC, fog);
  outColor = vec4(tonemap(col), t.a * uColor.a);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform vec3 uOffset;
uniform vec3 uScale;
void main() { gl_Position = uVP * vec4(uOffset + aPos * uScale, 1.0); }`;
const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`;

const PART_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aData;
layout(location=2) in vec4 aCol;
uniform mat4 uVP;
uniform float uPxScale;
out vec4 vData;
out vec4 vCol;
out float vDist;
void main() {
  vec4 c = uVP * vec4(aPos, 1.0);
  gl_Position = c;
  gl_PointSize = clamp(aData.w * uPxScale / max(c.w, 0.05), 1.0, 96.0);
  vData = aData;
  vCol = aCol;
  vDist = length(aPos);
}`;
const PART_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec4 vData;
in vec4 vCol;
in float vDist;
uniform sampler2DArray uTex;
uniform vec3 uAmbient;
uniform vec3 uTorch;
uniform vec3 uLightColor;
uniform float uExposure;
out vec4 outColor;
vec3 tm(vec3 c) { c *= uExposure; c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
void main() {
  if (vData.x < 0.0) {
    vec2 pc = gl_PointCoord - 0.5;
    if (dot(pc, pc) > 0.25) discard;
    outColor = vec4(tm(vCol.rgb), vCol.a);
    return;
  }
  vec2 uv = vData.yz + gl_PointCoord * 0.25;
  vec4 t = texelFetch(uTex, ivec3(clamp(floor(uv * 16.0), 0.0, 15.0), int(vData.x + 0.5)), 0);
  if (t.a < 0.5) discard;
  float sky = vCol.x, blk = vCol.y;
  vec3 light = uAmbient * sky * sky + uTorch * blk * blk + uLightColor * sky * 0.6 + 0.02;
  vec3 alb = pow(t.rgb, vec3(2.2));
  if (vCol.z > 0.5) alb *= pow(vec3(0.5, 0.74, 0.3), vec3(2.2)) * 1.25;
  outColor = vec4(tm(alb * light), 1.0);
}`;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.progs = {};
    this.progs.chunk = this.program(CHUNK_VS, CHUNK_FS);
    this.progs.water = this.program(CHUNK_VS, WATER_FS);
    this.progs.shadow = this.program(CHUNK_VS, SHADOW_FS);
    this.progs.sky = this.program(SKY_VS, SKY_FS);
    this.progs.ent = this.program(ENT_VS, ENT_FS);
    this.progs.line = this.program(LINE_VS, LINE_FS);
    this.progs.part = this.program(PART_VS, PART_FS);
    this.quadCap = 0;
    this.ebo = gl.createBuffer();
    this.ensureQuads(65536);
    this.skyVAO = gl.createVertexArray();
    this.buildCube();
    this.buildLines();
    this.partVAO = gl.createVertexArray();
    this.partVBO = gl.createBuffer();
    gl.bindVertexArray(this.partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partVBO);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 44, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 44, 28);
    gl.bindVertexArray(null);
    this.shadowSize = 0;
    this.shadowTex = null;
    this.shadowFBO = null;
    this.frame = {};
  }
  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
        console.error(log + '\n' + lines);
        throw new Error('Shader compile failed: ' + log);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  ensureQuads(n) {
    if (n <= this.quadCap) return;
    let cap = Math.max(this.quadCap, 65536);
    while (cap < n) cap *= 2;
    const idx = new Uint32Array(cap * 6);
    for (let q = 0, v = 0, i = 0; q < cap; q++, v += 4) {
      idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2; idx[i++] = v; idx[i++] = v + 2; idx[i++] = v + 3;
    }
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.quadCap = cap;
  }
  uploadTextures(levels, layers) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    let size = 16;
    levels.forEach((data, lvl) => {
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, lvl, gl.RGBA8, size, size, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      size >>= 1;
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, levels.length - 1);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.tex = t;
  }
  setShadowSize(size) {
    const gl = this.gl;
    if (this.shadowSize === size) return;
    if (this.shadowTex) { gl.deleteTexture(this.shadowTex); gl.deleteFramebuffer(this.shadowFBO); this.shadowTex = null; this.shadowFBO = null; }
    this.shadowSize = size;
    if (!size) return;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { gl.deleteTexture(t); gl.deleteFramebuffer(fb); this.shadowSize = 0; return; }
    this.shadowTex = t; this.shadowFBO = fb;
    // A 1x1 dummy shadow map keeps the sampler valid when shadows are off.
  }
  dummyShadow() {
    if (this._dummy) return this._dummy;
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 1, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    this._dummy = t;
    return t;
  }
  buildCube() {
    const gl = this.gl;
    // 24 vertices: pos(3) normal(3) uv(2) face(1)
    const v = [];
    for (let f = 0; f < 6; f++) {
      const n = FN[f], bl = FBL[f], r = FR[f], u = FU[f];
      for (let k = 0; k < 4; k++) {
        const p = [bl[0] + r[0] * CR[k] + u[0] * CU[k] - 0.5, bl[1] + r[1] * CR[k] + u[1] * CU[k] - 0.5, bl[2] + r[2] * CR[k] + u[2] * CU[k] - 0.5];
        v.push(p[0], p[1], p[2], n[0], n[1], n[2], CR[k], 1 - CU[k], f);
      }
    }
    this.cubeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.cubeVAO);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bindVertexArray(null);
    // flat quad (front +Z face only, both sides drawn with culling off)
    const q = [];
    const qc = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (let k = 0; k < 4; k++) q.push(qc[k][0], qc[k][1], 0, 0, 0, 1, CR[k], 1 - CU[k], 4);
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bindVertexArray(null);
  }
  buildLines() {
    const gl = this.gl;
    const e = [];
    const c = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of edges) e.push(...c[a], ...c[b]);
    this.lineVAO = gl.createVertexArray();
    gl.bindVertexArray(this.lineVAO);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(e), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
  }
  makeMesh(words) {
    const gl = this.gl;
    const quads = words.length / 12;
    if (!quads) return null;
    this.ensureQuads(quads);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, words, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 3, gl.UNSIGNED_INT, 12, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bindVertexArray(null);
    return { vao, vbo, quads };
  }
  freeMesh(m) { if (!m) return; this.gl.deleteVertexArray(m.vao); this.gl.deleteBuffer(m.vbo); }

  // ---- per-frame uniforms ----
  setCommon(prog, f) {
    const gl = this.gl, u = prog.u;
    if (u.uSunDir) gl.uniform3fv(u.uSunDir, f.sunDir);
    if (u.uLightDir) gl.uniform3fv(u.uLightDir, f.lightDir);
    if (u.uZenith) gl.uniform3fv(u.uZenith, f.zenith);
    if (u.uHorizon) gl.uniform3fv(u.uHorizon, f.horizon);
    if (u.uSunGlow) gl.uniform3fv(u.uSunGlow, f.sunGlow);
    if (u.uTime) gl.uniform1f(u.uTime, f.time);
    if (u.uCamPos) gl.uniform3fv(u.uCamPos, f.camPos);
    if (u.uExposure) gl.uniform1f(u.uExposure, f.exposure);
    if (u.uCloudCover) gl.uniform1f(u.uCloudCover, f.cloudCover);
    if (u.uLightColor) gl.uniform3fv(u.uLightColor, f.lightColor);
    if (u.uAmbient) gl.uniform3fv(u.uAmbient, f.ambient);
    if (u.uTorch) gl.uniform3fv(u.uTorch, f.torch);
    if (u.uFogNear) gl.uniform1f(u.uFogNear, f.fogNear);
    if (u.uFogFar) gl.uniform1f(u.uFogFar, f.fogFar);
    if (u.uUnderwater) gl.uniform1i(u.uUnderwater, f.underwater);
    if (u.uWaterFog) gl.uniform3fv(u.uWaterFog, f.waterFog);
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, f.vp);
    if (u.uWind) gl.uniform1f(u.uWind, f.wind);
  }

  // Frustum planes from a clip matrix (camera-relative)
  frustum(m) {
    const p = [];
    const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
    const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    const add = (a, b, s) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]];
    p.push(add(r3, r0, 1), add(r3, r0, -1), add(r3, r1, 1), add(r3, r1, -1), add(r3, r2, 1), add(r3, r2, -1));
    return p;
  }
  boxVisible(planes, x0, y0, z0, x1, y1, z1) {
    for (const p of planes) {
      const x = p[0] > 0 ? x1 : x0, y = p[1] > 0 ? y1 : y0, z = p[2] > 0 ? z1 : z0;
      if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
    }
    return true;
  }

  renderShadows(chunks, f) {
    const gl = this.gl;
    if (!this.shadowFBO) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 2.5);
    const pr = this.progs.shadow;
    gl.useProgram(pr.p);
    gl.uniformMatrix4fv(pr.u.uVP, false, f.shadowVP);
    gl.uniform1f(pr.u.uTime, f.time);
    gl.uniform1f(pr.u.uWind, f.wind);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(pr.u.uTex, 0);
    const planes = this.frustum(f.shadowVP);
    for (const c of chunks) {
      if (!c.mesh) continue;
      const ox = c.cx * 16 - f.camPos[0], oz = c.cz * 16 - f.camPos[2], oy = -f.camPos[1];
      if (!this.boxVisible(planes, ox, oy, oz, ox + 16, oy + CH, oz + 16)) continue;
      gl.uniform3f(pr.u.uOrigin, ox, oy, oz);
      gl.uniform3f(pr.u.uChunkWorld, c.cx * 16, 0, c.cz * 16);
      gl.bindVertexArray(c.mesh.vao);
      gl.drawElements(gl.TRIANGLES, c.mesh.quads * 6, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  renderSky(f) {
    const gl = this.gl, pr = this.progs.sky;
    gl.useProgram(pr.p);
    this.setCommon(pr, f);
    gl.uniform3fv(pr.u.uFwd, f.fwd); gl.uniform3fv(pr.u.uRight, f.right); gl.uniform3fv(pr.u.uUp, f.up);
    gl.uniform2f(pr.u.uTanHalf, f.tanHalf[0], f.tanHalf[1]);
    gl.uniform1f(pr.u.uNight, f.night);
    gl.uniform3fv(pr.u.uCloudColor, f.cloudColor);
    gl.uniform3fv(pr.u.uSunDisc, f.sunDisc);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindVertexArray(this.skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  renderChunks(list, f, translucent) {
    const gl = this.gl;
    const pr = translucent ? this.progs.water : this.progs.chunk;
    gl.useProgram(pr.p);
    this.setCommon(pr, f);
    gl.uniformMatrix4fv(pr.u.uShadowVP, false, f.shadowVP);
    gl.uniform1f(pr.u.uShadowOn, f.shadowOn ? 1 : 0);
    gl.uniform1f(pr.u.uShadowTexel, 1 / Math.max(1, this.shadowSize));
    if (pr.u.uLavaLayer) gl.uniform1i(pr.u.uLavaLayer, TEX.lava);
    if (pr.u.uWaterLayer) gl.uniform1i(pr.u.uWaterLayer, TEX.water);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(pr.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, f.shadowOn && this.shadowTex ? this.shadowTex : this.dummyShadow());
    gl.uniform1i(pr.u.uShadowMap, 1);
    gl.activeTexture(gl.TEXTURE0);
    if (translucent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }
    for (const c of list) {
      const m = translucent ? c.tmesh : c.mesh;
      if (!m) continue;
      gl.uniform3f(pr.u.uOrigin, c.cx * 16 - f.camPos[0], -f.camPos[1], c.cz * 16 - f.camPos[2]);
      gl.uniform3f(pr.u.uChunkWorld, c.cx * 16, 0, c.cz * 16);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.quads * 6, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    if (translucent) { gl.disable(gl.BLEND); gl.depthMask(true); }
    gl.disable(gl.CULL_FACE);
  }

  // Draws a textured box. layers: [+x,-x,+y,-y,+z,-z]
  beginEntities(f) {
    const gl = this.gl, pr = this.progs.ent;
    gl.useProgram(pr.p);
    this.setCommon(pr, f);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(pr.u.uTex, 0);
    gl.uniform4f(pr.u.uColor, 1, 1, 1, 1);
    gl.uniform3f(pr.u.uFlash, 0, 0, 0);
    gl.uniform4f(pr.u.uUVRect, 0, 0, 1, 1);
    gl.uniform1f(pr.u.uUnlit, 0);
    gl.uniform4f(pr.u.uTint, 1, 1, 1, 0);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(this.cubeVAO);
    this._entLayers = null;
  }
  drawBox(model, size, layers, tile, light) {
    const gl = this.gl, u = this.progs.ent.u;
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3f(u.uSize, size[0], size[1], size[2]);
    gl.uniform1f(u.uTile, tile ? 1 : 0);
    if (this._entLayers !== layers) { gl.uniform1iv(u.uLayers, layers); this._entLayers = layers; }
    if (light) gl.uniform2f(u.uLight, light[0], light[1]);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_INT, 0);
  }
  drawQuad(model, layer, light, uvRect) {
    const gl = this.gl, u = this.progs.ent.u;
    gl.bindVertexArray(this.quadVAO);
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3f(u.uSize, 1, 1, 1);
    gl.uniform1f(u.uTile, 0);
    const L = [layer, layer, layer, layer, layer, layer];
    gl.uniform1iv(u.uLayers, L); this._entLayers = null;
    if (light) gl.uniform2f(u.uLight, light[0], light[1]);
    if (uvRect) gl.uniform4f(u.uUVRect, uvRect[0], uvRect[1], uvRect[2], uvRect[3]);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
    if (uvRect) gl.uniform4f(u.uUVRect, 0, 0, 1, 1);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(this.cubeVAO);
  }
  setTint(t) { const u = this.progs.ent.u; if (t) this.gl.uniform4f(u.uTint, t[0], t[1], t[2], 1); else this.gl.uniform4f(u.uTint, 1, 1, 1, 0); }
  endEntities() { const gl = this.gl; gl.bindVertexArray(null); gl.disable(gl.CULL_FACE); }

  drawSelection(f, x, y, z, w, h, d, color) {
    const gl = this.gl, pr = this.progs.line;
    gl.useProgram(pr.p);
    gl.uniformMatrix4fv(pr.u.uVP, false, f.vp);
    gl.uniform3f(pr.u.uOffset, x - f.camPos[0], y - f.camPos[1], z - f.camPos[2]);
    gl.uniform3f(pr.u.uScale, w, h, d);
    gl.uniform4fv(pr.u.uColor, color || [0, 0, 0, 0.55]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.lineVAO);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  drawParticles(f, data, count) {
    if (!count) return;
    const gl = this.gl, pr = this.progs.part;
    gl.useProgram(pr.p);
    gl.uniformMatrix4fv(pr.u.uVP, false, f.vp);
    gl.uniform1f(pr.u.uPxScale, f.pxScale);
    gl.uniform3fv(pr.u.uAmbient, f.ambient);
    gl.uniform3fv(pr.u.uTorch, f.torch);
    gl.uniform3fv(pr.u.uLightColor, f.lightColor);
    gl.uniform1f(pr.u.uExposure, f.exposure);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(pr.u.uTex, 0);
    gl.bindVertexArray(this.partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partVBO);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 11), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}
