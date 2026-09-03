/* Ported from react-bits Galaxy (MIT):
 * https://reactbits.dev/backgrounds/galaxy
 */
import { Renderer, Program, Mesh, Color, Triangle } from "ogl";

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform bool uTransparent;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);

      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
      float star = Star(gv - offset - pad, flareSize);
      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      col += star * twinkle * size * base;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;
  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  float alpha = min(smoothstep(0.0, 0.3, length(col)), 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

const STAR_SPEED = 0.35;
const REDUCE_MOTION = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type GalaxyInstance = {
  destroy: () => void;
};

let instance: GalaxyInstance | null = null;
let themeObserver: MutationObserver | null = null;

function isDarkTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function createGalaxy(ctn: HTMLElement): GalaxyInstance | null {
  const disableAnimation = REDUCE_MOTION();
  const renderer = new Renderer({
    alpha: true,
    premultipliedAlpha: false,
  });
  const gl = renderer.gl;
  if (!gl) return null;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let program: Program;

  function resize() {
    const width = Math.max(ctn.clientWidth, window.innerWidth, 1);
    const height = Math.max(ctn.clientHeight, window.innerHeight, 1);
    renderer.setSize(width, height);
    if (program) {
      program.uniforms.uResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / gl.canvas.height
      );
    }
  }

  const geometry = new Triangle(gl);
  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: {
        value: new Color(1, 1, 1),
      },
      uFocal: { value: new Float32Array([0.5, 0.5]) },
      uRotation: { value: new Float32Array([1.0, 0.0]) },
      uStarSpeed: { value: STAR_SPEED },
      uDensity: { value: 1.4 },
      uHueShift: { value: 220 },
      uSpeed: { value: 0.85 },
      uGlowIntensity: { value: 0.4 },
      uSaturation: { value: 0.22 },
      uTwinkleIntensity: { value: 0.5 },
      uRotationSpeed: { value: 0.04 },
      uTransparent: { value: true },
    },
  });

  const mesh = new Mesh(gl, { geometry, program });
  let animateId = 0;

  function update(t: number) {
    animateId = requestAnimationFrame(update);
    if (document.hidden) return;
    if (!disableAnimation) {
      program.uniforms.uTime.value = t * 0.001;
      program.uniforms.uStarSpeed.value = (t * 0.001 * STAR_SPEED) / 10.0;
    }
    renderer.render({ scene: mesh });
  }

  window.addEventListener("resize", resize);
  const ro = new ResizeObserver(resize);
  ro.observe(ctn);
  ctn.replaceChildren(gl.canvas);
  resize();
  animateId = requestAnimationFrame(update);

  return {
    destroy() {
      cancelAnimationFrame(animateId);
      window.removeEventListener("resize", resize);
      ro.disconnect();
      if (gl.canvas.parentNode === ctn) {
        ctn.removeChild(gl.canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function sync() {
  const ctn = document.getElementById("home-galaxy");
  const shouldShow = Boolean(ctn) && isDarkTheme();

  if (!shouldShow) {
    instance?.destroy();
    instance = null;
    return;
  }

  if (!instance) {
    instance = createGalaxy(ctn!) ?? null;
  }
}

function setup() {
  themeObserver?.disconnect();
  themeObserver = new MutationObserver(sync);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  sync();
}

setup();
document.addEventListener("astro:page-load", setup);
document.addEventListener("astro:after-swap", setup);
