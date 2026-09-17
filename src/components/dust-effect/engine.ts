import { dustFrag, dustVert } from "./shaders";

export const DUST_FINISHED_PHASE = 1.6;
const MAX_PARTICLES = 160_000;

export type DustBurst = {
  image: CanvasImageSource;
  originX: number;
  originY: number;
  width: number;
  height: number;
  radius?: number;
};

type Uniforms = {
  canvas: WebGLUniformLocation;
  origin: WebGLUniformLocation;
  size: WebGLUniformLocation;
  resolution: WebGLUniformLocation;
  phase: WebGLUniformLocation;
  texture: WebGLUniformLocation;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "shader compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create program");
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "program link failed";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

function snapshot(
  image: CanvasImageSource,
  width: number,
  height: number,
  radius: number,
  dpr: number
) {
  const canvas = document.createElement("canvas");
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const r = Math.min(radius * dpr, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(0, 0, w, h, r);
  } else {
    ctx.rect(0, 0, w, h);
  }
  ctx.clip();
  ctx.drawImage(image, 0, 0, w, h);
  return canvas;
}

function particleGrid(width: number, height: number) {
  const columns = Math.max(1, Math.round(width));
  const rows = Math.max(1, Math.round(height));
  const count = columns * rows;
  if (count <= MAX_PARTICLES) return { columns, rows, count };
  const scale = Math.sqrt(MAX_PARTICLES / count);
  const nextColumns = Math.max(1, Math.round(columns * scale));
  const nextRows = Math.max(1, Math.round(rows * scale));
  return { columns: nextColumns, rows: nextRows, count: nextColumns * nextRows };
}

export class DustEngine {
  static create(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) return null;
    try {
      return new DustEngine(canvas, gl);
    } catch (error) {
      console.error("[dust] webgl init failed", error);
      return null;
    }
  }

  onFinished: (() => void) | null = null;

  private program: WebGLProgram;
  private uniforms: Uniforms;
  private vao: WebGLVertexArrayObject;
  private texture: WebGLTexture;
  private raf = 0;
  private playing = false;
  private phase = 0;
  private lastTime = 0;
  private columns = 1;
  private rows = 1;
  private originX = 0;
  private originY = 0;
  private width = 0;
  private height = 0;
  private disposed = false;

  private constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGL2RenderingContext
  ) {
    this.program = link(gl, dustVert, dustFrag);
    const u = (name: string) => {
      const loc = gl.getUniformLocation(this.program, name);
      if (!loc) throw new Error(`Missing uniform ${name}`);
      return loc;
    };
    this.uniforms = {
      canvas: u("uCanvas"),
      origin: u("uOrigin"),
      size: u("uSize"),
      resolution: u("uResolution"),
      phase: u("uPhase"),
      texture: u("uTexture"),
    };
    const vao = gl.createVertexArray();
    const texture = gl.createTexture();
    if (!vao || !texture) throw new Error("Unable to allocate GPU objects");
    this.vao = vao;
    this.texture = texture;

    gl.bindVertexArray(vao);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  resize() {
    const { canvas, gl } = this;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (this.playing) this.draw();
    else this.clear();
  }

  burst(source: DustBurst) {
    if (this.disposed) return;
    this.stop();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = snapshot(
      source.image,
      source.width,
      source.height,
      source.radius ?? 16,
      dpr
    );
    const grid = particleGrid(source.width, source.height);
    this.columns = grid.columns;
    this.rows = grid.rows;
    this.originX = source.originX;
    this.originY = source.originY;
    this.width = source.width;
    this.height = source.height;
    this.upload(pixels);
    this.phase = 0;
    this.lastTime = 0;
    this.playing = true;
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.playing = false;
    this.phase = 0;
    this.lastTime = 0;
    this.clear();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    const { gl } = this;
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }

  private tick = (time: number) => {
    if (!this.playing || this.disposed) return;
    const seconds = time * 0.001;
    let delta = this.lastTime ? seconds - this.lastTime : 1 / 60;
    this.lastTime = seconds;
    delta = Math.min(Math.max(delta, 1 / 120), 1 / 15);
    this.phase += delta;
    this.draw();
    if (this.phase >= DUST_FINISHED_PHASE) {
      this.playing = false;
      this.raf = 0;
      this.clear();
      this.onFinished?.();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private upload(source: TexImageSource) {
    const { gl, texture } = this;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  private draw() {
    const { gl, canvas, uniforms } = this;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform2f(uniforms.canvas, rect.width, rect.height);
    gl.uniform2f(uniforms.origin, this.originX, this.originY);
    gl.uniform2f(uniforms.size, this.width, this.height);
    gl.uniform2ui(uniforms.resolution, this.columns, this.rows);
    gl.uniform1f(uniforms.phase, this.phase);
    gl.uniform1i(uniforms.texture, 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.columns * this.rows);
    gl.bindVertexArray(null);
  }

  private clear() {
    const { gl, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
