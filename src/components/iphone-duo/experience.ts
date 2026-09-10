import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";
import { foldShader, screenShader } from "./shaders";
import { loadDefaultUIs, type DefaultTheme, type UIKind } from "./ui";

const asset = (path: string) => {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
};

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d canvas unavailable");
  return { canvas, context };
}

function coverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.fillStyle = "#101418";
  context.fillRect(0, 0, width, height);
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

async function loadImage(path: string) {
  const image = new Image();
  image.src = asset(path);
  await image.decode();
  return image;
}

const MOVING = "upTUAKvMVkPOMKq";
const FIXED = "SiftyleUEEZwLhF";
const FLEXIBLE = new Set([
  "JnJdTkxbQgUtLwU",
  "xdyyaajWsatVNxN",
  "UXtsBZYlaUvHoEh",
  "MvKPXGSdYDVvSpk",
]);
const INNER = "UXtsBZYlaUvHoEh";
const OUTER = "hhgAIoCGsHXeDPY";

const uiReferenceEye = new THREE.Vector3(0, 0, 40);
const innerUIFrame = new THREE.Vector4(-7.89935, 0.34562 - 5.8974, 15.7987, 11.1035);
const outerUIFrame = new THREE.Vector4(0.23396, 0.27173 - 5.8974, 7.73936, 11.2513).multiplyScalar(
  (uiReferenceEye.z - 0.24948) / (uiReferenceEye.z - 0.825538)
);

type Screen = {
  material: THREE.MeshStandardMaterial;
  defaultTextures: Record<DefaultTheme, THREE.CanvasTexture>;
  frame: { value: THREE.Vector4 };
  gradient: { value: THREE.Vector2 };
  pixel: { value: THREE.Vector2 };
};

export type DuoTheme = DefaultTheme | "custom";

export type DuoCallbacks = {
  onReady?: () => void;
  onAngle?: (value: number) => void;
  onPlaying?: (value: boolean) => void;
  onError?: (message: string) => void;
};

export class DuoExperience {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 250);
  private readonly controls: OrbitControls;
  private readonly phone = new THREE.Group();
  private readonly bend = { value: 0 };
  private readonly screens = {} as Record<UIKind, Screen>;
  private readonly customCanvases = {
    inner: makeCanvas(1600, 1125),
    outer: makeCanvas(774, 1125),
  };
  private readonly customTextures = {} as Record<UIKind, THREE.CanvasTexture>;
  private readonly textures: THREE.Texture[] = [];
  private resizeObserver?: ResizeObserver;
  private angle = 180;
  private playing = false;
  private phase = 0;
  private transition: { from: number; to: number; elapsed: number } | null = null;
  private ready = false;
  private theme: DuoTheme = "wallpaper";
  private lastTime = performance.now();
  private disposed = false;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly callbacks: DuoCallbacks = {}
  ) {
    this.camera.position.set(0, 0, 40);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0xf6f6f3, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.viewport.appendChild(this.renderer.domElement);
    this.resize();

    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture;
    environment.dispose();
    pmrem.dispose();
    this.scene.environmentIntensity = 1.35;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb5baa8, 1.8));
    const key = new THREE.DirectionalLight(0xfffcf5, 2.6);
    key.position.set(-15, 25, 30);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8edf5, 2);
    rim.position.set(15, 5, -15);
    this.scene.add(rim);
    this.scene.add(this.phone);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 21;
    this.controls.maxDistance = 65;
    this.controls.target.set(0, 0, 0.275454);
    this.controls.update();

    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    for (const kind of ["inner", "outer"] as const) {
      const texture = new THREE.CanvasTexture(this.customCanvases[kind].canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      this.customTextures[kind] = texture;
      this.textures.push(texture);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.renderer.setAnimationLoop(time => this.tick(time));
    void this.load();
  }

  getAngle() {
    return this.angle;
  }

  isPlaying() {
    return this.playing;
  }

  setAngle(value: number) {
    this.angle = value;
    this.bend.value = ((180 - value) / 180) * Math.PI;
    if (this.screens.outer) {
      this.screens.outer.material.emissiveIntensity = value >= 180 ? 0 : 1;
    }
    this.callbacks.onAngle?.(value);
  }

  setPlaying(value: boolean) {
    this.playing = value;
    this.callbacks.onPlaying?.(value);
  }

  togglePlaying() {
    this.transition = null;
    if (!this.playing) {
      this.phase = 1.2 + (Math.acos((2 * this.angle) / 180 - 1) / Math.PI) * 3.1;
    }
    this.setPlaying(!this.playing);
  }

  showTheme(theme: DefaultTheme | "custom") {
    if (!this.screens.inner || !this.screens.outer) return;
    this.theme = theme;
    for (const kind of ["inner", "outer"] as const) {
      const screen = this.screens[kind];
      const texture =
        theme === "custom"
          ? this.customTextures[kind]
          : screen.defaultTextures[theme];
      if (!texture) continue;
      screen.material.emissiveMap = texture;
      screen.material.needsUpdate = true;
      texture.needsUpdate = true;
      const { width, height } = texture.image;
      screen.pixel.value.set(1 / width, 1 / height);
      screen.frame.value.copy(kind === "inner" ? innerUIFrame : outerUIFrame);
      screen.gradient.value.set(kind === "inner" ? 0.5 : 0, kind === "inner" ? 0 : 1);
    }
  }

  async setCustomImage(kind: UIKind, file: File) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      this.paintCustom(kind, image);
      this.showTheme("custom");
      this.setPlaying(false);
      this.transition = {
        from: this.angle,
        to: kind === "inner" ? 180 : 0,
        elapsed: 0,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private paintCustom(kind: UIKind, image: HTMLImageElement) {
    const { canvas, context } = this.customCanvases[kind];
    coverImage(context, image, canvas.width, canvas.height);
    this.customTextures[kind].needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.controls.dispose();
    this.phone.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    for (const texture of this.textures) texture.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private finishBodyMaterial(material: THREE.Material) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const list = Array.isArray(material) ? material : [material];
    for (const item of list) {
      if (!(item instanceof THREE.MeshStandardMaterial)) continue;
      const linear = [
        item.normalMap,
        item.roughnessMap,
        item.metalnessMap,
        item.aoMap,
      ];
      for (const texture of linear) {
        if (!texture) continue;
        texture.colorSpace = THREE.NoColorSpace;
        texture.anisotropy = maxAniso;
        texture.needsUpdate = true;
      }
      const colorMaps = [item.map, item.emissiveMap];
      if ("specularColorMap" in item) {
        colorMaps.push(
          (item as THREE.MeshPhysicalMaterial).specularColorMap ?? null
        );
      }
      for (const texture of colorMaps) {
        if (!texture) continue;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAniso;
        texture.needsUpdate = true;
      }
      if (item.transparent || item.opacity < 0.95) continue;
      if ("transmission" in item && (item as THREE.MeshPhysicalMaterial).transmission > 0) {
        continue;
      }
      // The open bezel reads grainy when USD albedo/normal data maps stay on
      // the chassis. Reference lighting wants a smooth dark titanium band.
      item.map = null;
      item.normalMap = null;
      item.normalScale.set(1, 1);
      item.color.setHex(0x2a2c30);
      item.metalness = 0.78;
      item.roughness = 0.46;
      item.envMapIntensity = 0.85;
    }
    return material;
  }

  private resize() {
    const { width, height } = this.viewport.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    const pixelsPerUnit = Math.min(width / 25, height / 17, 37);
    this.camera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(height / pixelsPerUnit / 2 / 40)
    );
    this.camera.updateProjectionMatrix();
  }

  private async load() {
    try {
      const modelPromise = new USDLoader().loadAsync(
        asset("iphone-duo/iPhone_Duo_Render.usdc")
      );
      const [defaultUIs, customInner, customOuter] = await Promise.all([
        loadDefaultUIs(),
        loadImage("iphone-duo/ui/custom-inner.png"),
        loadImage("iphone-duo/ui/custom-outer.png"),
      ]);
      if (this.disposed) {
        void modelPromise;
        return;
      }
      const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      for (const kind of ["inner", "outer"] as const) {
        const defaultTextures = {} as Record<DefaultTheme, THREE.CanvasTexture>;
        for (const theme of ["wallpaper", "launcher"] as const) {
          const texture = new THREE.CanvasTexture(defaultUIs[theme][kind]);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = anisotropy;
          defaultTextures[theme] = texture;
          this.textures.push(texture);
        }
        const material = new THREE.MeshStandardMaterial({
          color: 0x060606,
          emissive: 0xffffff,
          emissiveMap: defaultTextures.wallpaper,
          roughness: 0.5,
          toneMapped: false,
        });
        this.screens[kind] = {
          material,
          defaultTextures,
          frame: {
            value: (kind === "inner" ? innerUIFrame : outerUIFrame).clone(),
          },
          gradient: {
            value: new THREE.Vector2(
              kind === "inner" ? 0.5 : 0,
              kind === "inner" ? 0 : 1
            ),
          },
          pixel: {
            value: new THREE.Vector2(
              1 / defaultUIs.wallpaper[kind].width,
              1 / defaultUIs.wallpaper[kind].height
            ),
          },
        };
      }

      const model = await modelPromise;
      if (this.disposed) return;
      model.scale.multiplyScalar(100);
      model.updateMatrixWorld(true);

      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        geometry.translate(0, -5.8974, 0);
        let ancestor: THREE.Object3D | null = object;
        while (ancestor && ancestor.name !== MOVING && ancestor.name !== FIXED) {
          ancestor = ancestor.parent;
        }
        const moving = ancestor?.name === MOVING;
        const flexible = FLEXIBLE.has(object.name);
        const kind: UIKind | null =
          object.name === INNER ? "inner" : object.name === OUTER ? "outer" : null;
        const material = kind
          ? this.screens[kind].material
          : this.finishBodyMaterial(object.material.clone());

        if (kind) {
          const positions = geometry.attributes.position;
          const uv = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) {
            uv[i * 2] =
              kind === "inner"
                ? (positions.getX(i) + 7.89935) / 15.7987
                : (-0.23396 - positions.getX(i)) / 7.73936;
            uv[i * 2 + 1] =
              kind === "inner"
                ? (positions.getY(i) + 5.8974 - 0.34562) / 11.1035
                : (positions.getY(i) + 5.8974 - 0.27173) / 11.2513;
          }
          geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        }

        if (moving || flexible) {
          material.onBeforeCompile = shader => {
            shader.uniforms.foldAngle = this.bend;
            if (kind) {
              shader.uniforms.uiFrame = this.screens[kind].frame;
              shader.uniforms.uiGradient = this.screens[kind].gradient;
              shader.uniforms.uiReferenceEye = { value: uiReferenceEye };
              shader.uniforms.uiPixel = this.screens[kind].pixel;
              shader.fragmentShader = shader.fragmentShader
                .replace(
                  "#include <emissivemap_pars_fragment>",
                  `
            #include <emissivemap_pars_fragment>
            ${kind === "inner" ? "#define INNER_UI" : ""}
            ${screenShader}
          `
                )
                .replace(
                  "#include <emissivemap_fragment>",
                  "totalEmissiveRadiance *= screenColor();"
                );
              shader.vertexShader = `varying vec3 vUIPosition;\n${shader.vertexShader}`;
              shader.vertexShader = shader.vertexShader.replace(
                "#include <project_vertex>",
                `
            vUIPosition = transformed;
            #include <project_vertex>
          `
              );
            }
            shader.vertexShader = `${flexible ? "#define FLEXIBLE_SCREEN\n" : ""}${foldShader}\n${shader.vertexShader}`;
            shader.vertexShader = shader.vertexShader.replace(
              "#include <begin_vertex>",
              flexible
                ? `
          vec4 folded = bendStrip(position);
          vec3 transformed = vec3(folded.x, position.y, folded.y);
        `
                : `
          vec2 folded = rotateHinge(position.xz);
          vec3 transformed = vec3(folded.x, position.y, folded.y);
        `
            );
            shader.vertexShader = shader.vertexShader.replace(
              "#include <beginnormal_vertex>",
              `
          vec3 objectNormal = vec3(normal);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif
          ${flexible ? "vec4 strip = bendStrip(position); float a = atan(-strip.w, strip.z);" : "float a = foldAngle;"}
          float ca = cos(a), sa = sin(a);
          objectNormal = vec3(ca * objectNormal.x + sa * objectNormal.z, objectNormal.y, -sa * objectNormal.x + ca * objectNormal.z);
          #ifdef USE_TANGENT
            objectTangent = vec3(ca * objectTangent.x + sa * objectTangent.z, objectTangent.y, -sa * objectTangent.x + ca * objectTangent.z);
          #endif
        `
            );
          };
          material.customProgramCacheKey = () =>
            `${flexible ? "fold-flexible" : "fold-cover"}-${kind || "body"}`;
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = object.name;
        mesh.frustumCulled = false;
        this.phone.add(mesh);
      });

      this.paintCustom("inner", customInner);
      this.paintCustom("outer", customOuter);
      this.showTheme("wallpaper");
      this.ready = true;
      this.setAngle(180);
      this.callbacks.onReady?.();
    } catch (error) {
      console.error("[iphone-duo] failed to load model", error);
      this.callbacks.onError?.("model");
    }
  }

  private tick(now: number) {
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (this.ready && this.playing) {
      this.phase = (this.phase + delta) % 8.6;
      let value: number;
      if (this.phase < 1.2) value = 180;
      else if (this.phase < 4.3)
        value = 90 * (1 + Math.cos(((this.phase - 1.2) / 3.1) * Math.PI));
      else if (this.phase < 5.5) value = 0;
      else value = 90 * (1 - Math.cos(((this.phase - 5.5) / 3.1) * Math.PI));
      this.setAngle(value);
    } else if (this.transition) {
      this.transition.elapsed += delta;
      const progress = Math.min(this.transition.elapsed / 1.4, 1);
      const ease = progress * progress * (3 - 2 * progress);
      this.setAngle(
        THREE.MathUtils.lerp(this.transition.from, this.transition.to, ease)
      );
      if (progress === 1) this.transition = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
