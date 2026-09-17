// Closed-form port of Telegram's DustEffect Metal kernels:
// one particle per point, left-to-right ease-in, gravity, lifetime fade.
// State is integrated analytically from phase so the CPU never stores particles.

export const dustVert = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uCanvas;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform uvec2 uResolution;
uniform float uPhase;

out vec2 vUv;
out float vAlpha;

uint wang(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

float hashToUnit(uint x) {
  return float(wang(x)) * 2.3283064365386963e-10;
}

// ∫ f(p, x) dp from 0 to phase. f is the left-to-right ease-in window.
float integratedFraction(float phase, float x) {
  float t0 = x / 2.25;
  float t1 = (x + 0.8) / 2.25;
  if (phase <= t0) {
    return 0.0;
  }

  float rampEnd = min(phase, t1);
  float a = 1.40625;
  float b = 1.25 * x;
  float rampI = (a * rampEnd * rampEnd - b * rampEnd) - (a * t0 * t0 - b * t0);
  if (phase <= t1) {
    return rampI;
  }
  return rampI + (phase - t1);
}

void main() {
  vec2 quad = vec2(0.0);
  if (gl_VertexID == 1 || gl_VertexID == 3) quad = vec2(1.0, 0.0);
  else if (gl_VertexID == 2 || gl_VertexID == 4) quad = vec2(0.0, 1.0);
  else if (gl_VertexID == 5) quad = vec2(1.0, 1.0);

  uint gid = uint(gl_InstanceID);
  uint cols = uResolution.x;
  uint rows = uResolution.y;
  uint ix = gid % cols;
  uint iy = gid / cols;

  vec2 particleSize = uSize / vec2(float(cols), float(rows));
  vec2 topLeft = vec2(float(ix), float(iy)) * particleSize;
  vUv = (topLeft + quad * particleSize) / uSize;

  float xFrac = float(ix) / float(cols);
  float I = integratedFraction(uPhase, xFrac);

  float direction = hashToUnit(gid) * 6.28318530718;
  float speed = (0.1 + hashToUnit(gid * 17u + 9u) * 0.1) * 420.0;
  vec2 v0 = vec2(cos(direction), sin(direction)) * speed;
  float lifetime0 = 0.7 + hashToUnit(gid * 31u + 3u) * 0.8;
  float lifetime = max(0.0, lifetime0 - 2.0 * I);
  // physics dt is 2× phase, gravity 120: offset = 2 v0 I + (0, 240 I²)
  vec2 offset = 2.0 * v0 * I + vec2(0.0, 240.0 * I * I);

  vec2 pos = uOrigin + topLeft + offset + quad * particleSize;
  gl_Position = vec4(
    pos.x / uCanvas.x * 2.0 - 1.0,
    1.0 - pos.y / uCanvas.y * 2.0,
    0.0,
    1.0
  );
  vAlpha = clamp(lifetime, 0.0, 0.3) / 0.3;
}
`;

export const dustFrag = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uTexture;

in vec2 vUv;
in float vAlpha;

out vec4 fragColor;

void main() {
  vec4 color = texture(uTexture, vUv);
  color.rgb *= color.a;
  fragColor = color * vAlpha;
}
`;
