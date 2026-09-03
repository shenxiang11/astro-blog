import * as THREE from "three";
import gsap from "gsap";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GroundReflector } from "./reflector";
import { PAINTS, type Paint, type PaintId } from "./colors";
import {
  dynamicEnvFrag,
  dynamicEnvVert,
  speedupFrag,
  speedupVert,
} from "./shaders";

const asset = (path: string) => {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
};

export type S65Callbacks = {
  onProgress: (value: number) => void;
  onReady: () => void;
  onRushing?: (value: boolean) => void;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DEFAULT_DISTANCE = 7;
const DEFAULT_TARGET = new THREE.Vector3(0, 0.8, 0);
const TARGET_CAR_LENGTH = 5.2365;
const IDLE_LOOK = {
  envIntensity: 0.7,
  bloom: 0.2,
  bloomThreshold: 0.22,
  bodyEnv: 0.75,
  lightEmissive: 0.6,
  reflectIntensity: 12,
};
const RUSH_LOOK = {
  bloom: 0.42,
  bloomThreshold: 0.12,
  bodyEnv: 1.05,
};
const WHEEL_NAME = /wheel/i;
const STEERING_NAME = /steer/i;
const HUB_GROUP = /^sw222_wheel_amg(?:[._]?\d+)?$/i;
const TIRE_GROUP = /^Object_4(?:[._]?\d+)?$/i;
const GLASS_NAME = /glass|window|windshield|windscreen|lens|transparent/i;
const GROUND_NAME = /ground|floor|shadow|plane|ao.?ground/i;
const SKIP_BODY_NAME =
  /interior|seat|cabin|chrome|light|lamp|emit|plate|logo|grill|grille|plastic|rubber|mirror|exhaust|engine|trim|alcantara/i;
const BODY_NAME = /paint|carpaint|coat|lacquer/i;

export class S65Experience {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(33.4, 1, 0.1, 200);
  private readonly timer = new THREE.Timer();
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private envMix!: THREE.WebGLRenderTarget;
  private envMixScene!: THREE.Scene;
  private envMixCamera!: THREE.OrthographicCamera;
  private envMixMat!: THREE.ShaderMaterial;
  private reflector?: GroundReflector;
  private speedupMat?: THREE.ShaderMaterial;
  private speedupRoot?: THREE.Object3D;
  private carRoot?: THREE.Object3D;
  private roomRoot?: THREE.Object3D;
  private bodyMats: THREE.MeshStandardMaterial[] = [];
  private lightMat?: THREE.MeshStandardMaterial;
  private floorMesh?: THREE.Mesh;
  private floorMat?: THREE.MeshPhysicalMaterial;
  private wheels: THREE.Object3D[] = [];
  private cubeCamera?: THREE.CubeCamera;
  private cubeRT?: THREE.WebGLCubeRenderTarget;
  private readonly cubeCaptureUniform: { value: THREE.CubeTexture | null } = { value: null };
  private readonly cubeBoostUniform = { value: 0 };
  private nightEnv?: THREE.Texture;
  private dayEnv?: THREE.Texture;
  private maps: Record<string, THREE.Texture> = {};
  private whiteMap!: THREE.DataTexture;
  private audio?: HTMLAudioElement;
  private raf = 0;
  private disposed = false;
  private pressed = false;
  private rushing = false;
  private introDone = false;
  private controlsEnabled = false;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private yaw = Math.PI * 0.5;
  private pitch = 0.12;
  private distance = 11;
  private target = DEFAULT_TARGET.clone();
  private fov = 33.4;
  private speed = 0;
  private targetSpeed = 0;
  private speedLerp = 1.5;
  private targetFov = 33.4;
  private targetDistance = DEFAULT_DISTANCE;
  private camLerp = 1.5;
  private speedTime = 0;
  private floorUvOffset = 0;
  private paintMetal = PAINTS[0].metal;
  private noiseTime = [Math.random() * -1000, Math.random() * -1000, Math.random() * -1000];
  private params = {
    envWeight: 0,
    envIntensity: 0,
    reflectIntensity: 0,
    lightEmissive: 0,
    lightOpacity: 1,
    floorColor: new THREE.Color("#000000"),
    bloom: IDLE_LOOK.bloom,
    bloomThreshold: IDLE_LOOK.bloomThreshold,
    bodyEnv: IDLE_LOOK.bodyEnv,
  };
  private tweens: gsap.core.Tween[] = [];
  private canvas: HTMLCanvasElement;
  private callbacks: S65Callbacks;

  constructor(canvas: HTMLCanvasElement, callbacks: S65Callbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.toneMappingExposure = 0.72;
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color("#000000");
    this.resize();
    window.addEventListener("resize", this.resize);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    void this.init().catch(error => {
      console.error("[s65] failed to start", error);
    });
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w, h);
  };

  private async init() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      this.callbacks.onProgress(total ? loaded / total : 0);
    };

    const gltfLoader = new GLTFLoader(manager);
    const decoder = MeshoptDecoder as typeof MeshoptDecoder & { ready?: Promise<void> };
    if (decoder.ready) await decoder.ready;
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    const rgbe = new HDRLoader(manager);
    const texLoader = new THREE.TextureLoader(manager);

    const loadGltf = (file: string) =>
      gltfLoader.loadAsync(asset(`s65/mesh/${file}`));
    const loadTex = (file: string, srgb = false, repeat = false) =>
      texLoader.loadAsync(asset(`s65/texture/${file}`)).then(t => {
        t.flipY = false;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        t.anisotropy = 4;
        if (repeat) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
        }
        return t;
      });

    const [
      carGltf,
      roomGltf,
      speedGltf,
      roomAo,
      roomLight,
      floorN,
      floorR,
      nightHdr,
      dayHdr,
    ] = await Promise.all([
      loadGltf("s65.glb"),
      loadGltf("sm_startroom.raw.glb"),
      loadGltf("sm_speedup.glb"),
      loadTex("t_startroom_ao.raw.jpg"),
      loadTex("t_startroom_light.raw.jpg", true),
      loadTex("t_floor_normal.webp", false, true),
      loadTex("t_floor_roughness.webp", false, true),
      rgbe.loadAsync(asset("s65/texture/t_env_night.hdr")),
      rgbe.loadAsync(asset("s65/texture/t_env_light.hdr")),
    ]);

    if (this.disposed) return;

    this.maps = {
      roomAo,
      roomLight,
      floorN,
      floorR,
    };
    this.whiteMap = this.makePixel(1, 1, 1);
    this.prepareMap(this.maps.roomAo, { channel: 1 });
    this.prepareMap(this.maps.roomLight, { channel: 1, srgb: true });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.nightEnv = pmrem.fromEquirectangular(nightHdr).texture;
    this.dayEnv = pmrem.fromEquirectangular(dayHdr).texture;
    nightHdr.dispose();
    dayHdr.dispose();
    pmrem.dispose();

    const envData = this.nightEnv.source.data as { width?: number; height?: number };
    const envWidth = envData.width || this.nightEnv.image.width;
    const envHeight = envData.height || this.nightEnv.image.height;
    this.envMix = new THREE.WebGLRenderTarget(envWidth, envHeight, {
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: false,
    });
    this.envMix.texture.mapping = THREE.CubeUVReflectionMapping;
    this.envMixMat = new THREE.ShaderMaterial({
      vertexShader: dynamicEnvVert,
      fragmentShader: dynamicEnvFrag,
      uniforms: {
        uEnvmap1: { value: this.nightEnv },
        uEnvmap2: { value: this.dayEnv },
        uWeight: { value: 0 },
        uIntensity: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.envMixScene = new THREE.Scene();
    this.envMixCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.envMixMat);
    this.envMixScene.add(quad);
    this.scene.environment = this.envMix.texture;

    this.cubeRT = new THREE.WebGLCubeRenderTarget(512, {
      type: THREE.UnsignedByteType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.cubeCamera = new THREE.CubeCamera(0.1, 50, this.cubeRT);
    this.cubeCaptureUniform.value = this.cubeRT.texture;

    this.setupCar(carGltf.scene);
    this.setupRoom(roomGltf.scene);
    this.setupSpeedup(speedGltf.scene);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight),
      IDLE_LOOK.bloom,
      0.8,
      IDLE_LOOK.bloomThreshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.audio = new Audio(asset("s65/audio/bgm2.mp3"));
    this.audio.loop = true;
    this.audio.volume = 0.45;

    this.applyCam();
    this.callbacks.onProgress(1);
    this.callbacks.onReady();
    this.playIntro();
    this.loop();
  }

  private makePixel(r: number, g: number, b: number) {
    const tex = new THREE.DataTexture(
      new Float32Array([r, g, b, 1]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    tex.needsUpdate = true;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    return tex;
  }

  private prepareMap(
    tex: THREE.Texture,
    opts: { channel?: number; nearest?: boolean; srgb?: boolean } = {}
  ) {
    tex.flipY = false;
    tex.channel = opts.channel ?? 0;
    tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    if (opts.nearest) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
    }
    tex.needsUpdate = true;
  }

  private setupCar(root: THREE.Group) {
    root.traverse(obj => {
      if (GROUND_NAME.test(obj.name)) {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
        if (size.y < 0.08) mesh.visible = false;
      }
    });

    this.fitCar(root);

    const namedWheels: THREE.Object3D[] = [];
    const bodyMats = new Set<THREE.MeshStandardMaterial>();
    const meshes: THREE.Mesh[] = [];

    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      meshes.push(mesh);
      if (
        !STEERING_NAME.test(mesh.name) &&
        (WHEEL_NAME.test(mesh.name) || WHEEL_NAME.test(mesh.parent?.name ?? ""))
      ) {
        namedWheels.push(mesh);
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std?.isMeshStandardMaterial) continue;
        std.envMapIntensity = 1;
        this.patchCarEnv(std);
        if (this.isGlassMat(std, mesh.name)) continue;
        if (WHEEL_NAME.test(mesh.name)) continue;
        if (this.isBodyMat(std, mesh.name)) bodyMats.add(std);
      }
    });

    if (!bodyMats.size) {
      const ranked = meshes
        .filter(mesh => !this.isGlassMesh(mesh) && !WHEEL_NAME.test(mesh.name))
        .map(mesh => {
          const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
          return { mesh, volume: size.x * size.y * size.z };
        })
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 8);
      for (const { mesh } of ranked) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (std?.isMeshStandardMaterial && !this.isGlassMat(std, mesh.name)) bodyMats.add(std);
        }
      }
    }

    this.bodyMats = [...bodyMats];
    const rolling = this.groupTiresWithWheels(root);
    this.wheels =
      rolling.length >= 4
        ? rolling
        : namedWheels.length
          ? this.uniqueWheelRoots(namedWheels)
          : this.makeWheelPivots(this.findCornerWheels(meshes));
    this.carRoot = root;
    this.applyPaint(PAINTS[0]);
    this.scene.add(root);
  }

  private fitCar(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const length = Math.max(size.x, size.z);
    if (length > 1e-4) root.scale.multiplyScalar(TARGET_CAR_LENGTH / length);
    if (size.z > size.x * 1.15) root.rotation.y += Math.PI / 2;
    root.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(root);
    const center = fitted.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= fitted.min.y;
    root.updateMatrixWorld(true);
  }

  private patchCarEnv(mat: THREE.MeshStandardMaterial) {
    if (mat.userData.s65CubeEnv) return;
    mat.userData.s65CubeEnv = true;
    const capture = this.cubeCaptureUniform;
    const boost = this.cubeBoostUniform;
    const prevCompile = mat.onBeforeCompile.bind(mat);
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      prevCompile(shader, renderer);
      shader.uniforms.cubeCaptureReflectMap = capture;
      shader.uniforms.uCubeBoost = boost;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform samplerCube cubeCaptureReflectMap;
           uniform float uCubeBoost;`
        )
        .replace(
          "return envMapColor.rgb * envMapIntensity;",
          `vec3 iblColor = envMapColor.rgb * envMapIntensity;
           float cubeLod = roughness * (1.7 - 0.7 * roughness);
           iblColor += textureLod(cubeCaptureReflectMap, envMapRotation * reflectVec, cubeLod * 6.0).rgb * (1.4 + roughness) * uCubeBoost;
           return iblColor;`
        );
    };
    mat.customProgramCacheKey = () => `${prevKey()}|s65-car-cube-env`;
    mat.needsUpdate = true;
  }

  private isGlassMat(mat: THREE.MeshStandardMaterial, meshName: string) {
    const label = `${mat.name} ${meshName}`;
    if (GLASS_NAME.test(label)) return true;
    if (mat.transparent && mat.opacity < 0.9) return true;
    const physical = mat as THREE.MeshPhysicalMaterial;
    return "transmission" in physical && physical.transmission > 0.1;
  }

  private isGlassMesh(mesh: THREE.Mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return mats.some(mat => this.isGlassMat(mat as THREE.MeshStandardMaterial, mesh.name));
  }

  private isBodyMat(mat: THREE.MeshStandardMaterial, meshName: string) {
    const label = `${mat.name} ${meshName}`;
    if (GLASS_NAME.test(label) || WHEEL_NAME.test(label) || SKIP_BODY_NAME.test(label)) {
      return false;
    }
    return BODY_NAME.test(mat.name);
  }

  private groupTiresWithWheels(root: THREE.Object3D) {
    const hubs: THREE.Object3D[] = [];
    const tires: THREE.Object3D[] = [];
    root.traverse(obj => {
      if (HUB_GROUP.test(obj.name)) hubs.push(obj);
      if (TIRE_GROUP.test(obj.name)) tires.push(obj);
    });
    if (hubs.length < 4) return [];

    root.updateMatrixWorld(true);
    const used = new Set<THREE.Object3D>();
    const pivots: THREE.Object3D[] = [];
    const hubCenter = new THREE.Vector3();
    const tireCenter = new THREE.Vector3();
    for (const hub of hubs) {
      new THREE.Box3().setFromObject(hub).getCenter(hubCenter);
      let nearest: THREE.Object3D | undefined;
      let nearestDist = Infinity;
      for (const tire of tires) {
        if (used.has(tire) || !tire.parent) continue;
        new THREE.Box3().setFromObject(tire).getCenter(tireCenter);
        const dist = hubCenter.distanceTo(tireCenter);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = tire;
        }
      }
      const parts = nearest && nearestDist < 1.5 ? [hub, nearest] : [hub];
      if (nearest && nearestDist < 1.5) used.add(nearest);
      const pivot = this.makeRollingPivot(parts);
      if (pivot) pivots.push(pivot);
    }
    return pivots;
  }

  private makeRollingPivot(parts: THREE.Object3D[]) {
    const parent = parts[0]?.parent;
    if (!parent) return undefined;
    const box = new THREE.Box3();
    for (const part of parts) box.expandByObject(part);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const axleWorld = new THREE.Vector3();
    if (size.z <= size.x && size.z <= size.y) axleWorld.set(0, 0, 1);
    else if (size.x <= size.y) axleWorld.set(1, 0, 0);
    else axleWorld.set(0, 1, 0);

    const pivot = new THREE.Group();
    parent.add(pivot);
    parent.updateMatrixWorld(true);
    pivot.position.copy(parent.worldToLocal(center));

    const axleLocal = axleWorld
      .clone()
      .transformDirection(parent.matrixWorld.clone().invert())
      .normalize();
    if (axleLocal.lengthSq() > 1e-6) {
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axleLocal);
    }
    pivot.updateMatrixWorld(true);
    for (const part of parts) pivot.attach(part);
    return pivot;
  }

  private findCornerWheels(meshes: THREE.Mesh[]) {
    const candidates = meshes
      .map(mesh => {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const round = Math.abs(size.x - size.z) / Math.max(size.x, size.z, 1e-4);
        return { mesh, size, center, round, height: size.y };
      })
      .filter(item => item.center.y < 0.55 && item.height < 1.1 && item.round < 0.45)
      .sort((a, b) => a.center.y - b.center.y)
      .slice(0, 12);
    return candidates.slice(0, 4).map(item => item.mesh);
  }

  private uniqueWheelRoots(nodes: THREE.Object3D[]) {
    const seen = new Set<THREE.Object3D>();
    const roots: THREE.Object3D[] = [];
    for (const node of nodes) {
      const root = node.parent && WHEEL_NAME.test(node.parent.name) ? node.parent : node;
      if (seen.has(root)) continue;
      seen.add(root);
      roots.push(root);
    }
    return roots;
  }

  private makeWheelPivots(nodes: THREE.Object3D[]) {
    const pivots: THREE.Object3D[] = [];
    const seen = new Set<THREE.Object3D>();
    for (const node of nodes) {
      const root = node.parent && WHEEL_NAME.test(node.parent.name) ? node.parent : node;
      if (seen.has(root) || !root.parent) continue;
      seen.add(root);
      const parent = root.parent;
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      parent.add(pivot);
      pivot.position.copy(parent.worldToLocal(center));
      pivot.attach(root);
      pivots.push(pivot);
    }
    return pivots;
  }

  private setupRoom(root: THREE.Group) {
    this.roomRoot = root;
    let floor: THREE.Mesh | undefined;
    let light: THREE.Mesh | undefined;
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name === "ReflecFloor" || mesh.name.includes("Plane.020")) floor = mesh;
      if (mesh.name.startsWith("light")) light = mesh;
    });
    if (!floor || !light) {
      const meshes: THREE.Mesh[] = [];
      root.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
      });
      light = meshes[1] ?? meshes[0];
      floor = meshes[0];
    }
    if (light) {
      const mat = light.material as THREE.MeshStandardMaterial;
      mat.emissive = new THREE.Color("#ffffff");
      mat.emissiveIntensity = 0;
      mat.toneMapped = false;
      mat.transparent = true;
      mat.opacity = 1;
      this.lightMat = mat;
    }
    if (floor) {
      const mat = (floor.material as THREE.MeshPhysicalMaterial).clone();
      mat.aoMap = this.maps.roomAo;
      mat.lightMap = this.maps.roomLight;
      mat.lightMapIntensity = 0;
      mat.normalMap = this.maps.floorN;
      mat.roughnessMap = this.maps.floorR;
      mat.envMapIntensity = 0;
      mat.color = new THREE.Color("#000000");
      this.floorMat = mat;
      this.floorMesh = floor;
      this.reflector = new GroundReflector(
        this.renderer,
        this.scene,
        floor,
        1024,
        [floor, light].filter(Boolean) as THREE.Object3D[]
      );
      this.patchFloor(mat);
      floor.material = mat;
    }
    this.scene.add(root);
  }

  private patchFloor(mat: THREE.MeshPhysicalMaterial) {
    const uniforms = {
      uColor: { value: this.params.floorColor },
      uFloorOffset: { value: 0 },
      uReflectMatrix: { value: new THREE.Matrix4() },
      uReflectTexture: { value: this.reflector?.texture ?? null },
      uReflectIntensity: { value: 0 },
      uFloorNormal: { value: this.maps.floorN },
      uFloorRoughness: { value: this.maps.floorR },
    };
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec4 vWorldPosition;`
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>
           vWorldPosition = worldPosition;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform vec3 uColor;
           uniform float uFloorOffset;
           uniform mat4 uReflectMatrix;
           uniform sampler2D uReflectTexture;
           uniform float uReflectIntensity;
           uniform sampler2D uFloorNormal;
           uniform sampler2D uFloorRoughness;
           varying vec4 vWorldPosition;`
        )
        .replace(
          "#include <opaque_fragment>",
          `#include <opaque_fragment>
           vec2 surfaceUv = vWorldPosition.xz;
           surfaceUv.x += uFloorOffset;
           vec3 surfaceNormal = texture2D(uFloorNormal, surfaceUv).rgb * 2.0 - 1.0;
           surfaceNormal = normalize(surfaceNormal.rbg);
           vec3 viewDir = normalize(vViewPosition);
           float d = length(vViewPosition);
           vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / max(d, 0.001));
           vec4 reflectPoint = uReflectMatrix * vWorldPosition;
           reflectPoint /= reflectPoint.w;
           float roughnessValue = texture2D(uFloorRoughness, surfaceUv).r;
           roughnessValue = roughnessValue * (1.7 - 0.7 * roughnessValue) * 4.0;
           vec3 reflectionSample = textureLod(uReflectTexture, reflectPoint.xy + distortion, roughnessValue).rgb;
           reflectionSample *= uReflectIntensity;
           float fres = pow(1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0), 3.0);
           vec3 baseCol = uColor * 3.0;
           gl_FragColor.rgb = mix(gl_FragColor.rgb * baseCol, reflectionSample, fres);`
        );
    };
    mat.customProgramCacheKey = () => "s65-floor";
    (mat as THREE.MeshPhysicalMaterial & { userData: { uniforms: typeof uniforms } }).userData.uniforms = uniforms;
  }

  private setupSpeedup(root: THREE.Group) {
    this.speedupRoot = root;
    this.speedupMat = new THREE.ShaderMaterial({
      vertexShader: speedupVert,
      fragmentShader: speedupFrag,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0 },
      },
    });
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.material = this.speedupMat!;
    });
    root.visible = false;
    this.scene.add(root);
  }

  private playIntro() {
    this.tween(this, { distance: 7, pitch: 0, duration: 4, ease: "power2.inOut" });
    this.tween(this.params, {
      envIntensity: IDLE_LOOK.envIntensity,
      duration: 4,
      delay: 0.5,
      ease: "power2.inOut",
      onUpdate: () => this.syncEnv(),
    });
    this.tween(this.params, {
      envWeight: 1,
      duration: 4,
      delay: 2,
      ease: "power2.inOut",
      onUpdate: () => this.syncEnv(),
    });
    this.tween(this.params, {
      lightEmissive: IDLE_LOOK.lightEmissive,
      reflectIntensity: IDLE_LOOK.reflectIntensity,
      duration: 4,
      delay: 1,
      ease: "power2.inOut",
      onUpdate: () => this.syncLight(),
    });
    this.tween(this.params.floorColor, { r: 1, g: 1, b: 1, duration: 4, delay: 1, ease: "power2.inOut" });
    gsap.delayedCall(4, () => {
      this.introDone = true;
      this.controlsEnabled = true;
      void this.audio?.play().catch(() => undefined);
    });
  }

  setPaint(id: PaintId) {
    this.applyPaint(PAINTS.find(item => item.id === id) ?? PAINTS[0]);
  }

  private applyPaint(paint: Paint) {
    this.paintMetal = paint.metal;
    for (const mat of this.bodyMats) {
      mat.color.set(paint.hex);
      mat.roughness = paint.rough;
      mat.metalness = paint.metal;
      mat.vertexColors = false;
      mat.lightMap = null;
      mat.emissiveMap = null;
      mat.roughnessMap = null;
      mat.metalnessMap = null;
      mat.map = this.whiteMap;
      if ("clearcoat" in mat) {
        const physical = mat as THREE.MeshPhysicalMaterial;
        physical.clearcoat = 1;
        physical.clearcoatRoughness = 0.04;
      }
      mat.needsUpdate = true;
    }
  }

  setPressed(pressed: boolean) {
    if (!this.introDone) {
      this.pressed = false;
      return;
    }
    if (this.pressed === pressed) return;
    this.pressed = pressed;
    this.callbacks.onRushing?.(pressed);
    if (pressed) this.rushIn();
    else this.rushOut();
  }

  setMuted(muted: boolean) {
    if (!this.audio) return;
    this.audio.muted = muted;
    if (!muted) void this.audio.play().catch(() => undefined);
  }

  private rushIn() {
    this.rushing = true;
    this.killRush();
    this.targetSpeed = 8;
    this.speedLerp = 0.5;
    this.targetFov = 60;
    this.targetDistance = 4;
    this.camLerp = 0.5;
    this.tween(this.params, { lightOpacity: 0, duration: 0.5, onUpdate: () => this.syncLight() });
    this.tween(this.params.floorColor, { r: 0, g: 0, b: 0, duration: 1 });
    this.tween(this.params, { envIntensity: IDLE_LOOK.envIntensity, duration: 1, onUpdate: () => this.syncEnv() });
    this.tween(this.params, {
      bloom: RUSH_LOOK.bloom,
      bloomThreshold: RUSH_LOOK.bloomThreshold,
      bodyEnv: RUSH_LOOK.bodyEnv,
      duration: 1.5,
      ease: "power2.inOut",
    });
    const body = this.bodyMats[0];
    if (body) {
      this.tween(body, {
        metalness: Math.max(0, this.paintMetal - 0.3),
        duration: 0.8,
        ease: "power2.in",
        onUpdate: () => {
          for (const mat of this.bodyMats) mat.metalness = body.metalness;
        },
      });
    }
  }

  private rushOut() {
    this.killRush();
    this.targetSpeed = 0;
    this.speedLerp = 1.5;
    this.targetFov = 33.4;
    this.targetDistance = DEFAULT_DISTANCE;
    this.camLerp = 1.5;
    this.tween(this.params, { lightOpacity: 1, duration: 0.5, onUpdate: () => this.syncLight() });
    this.tween(this.params.floorColor, { r: 1, g: 1, b: 1, duration: 1 });
    this.tween(this.params, { envIntensity: IDLE_LOOK.envIntensity, duration: 1, onUpdate: () => this.syncEnv() });
    this.tween(this.params, {
      bloom: IDLE_LOOK.bloom,
      bloomThreshold: IDLE_LOOK.bloomThreshold,
      bodyEnv: IDLE_LOOK.bodyEnv,
      duration: 2,
      ease: "power2.inOut",
    });
    const body = this.bodyMats[0];
    if (body) {
      this.tween(body, {
        metalness: this.paintMetal,
        duration: 1,
        onUpdate: () => {
          for (const mat of this.bodyMats) mat.metalness = body.metalness;
        },
      });
    }
    this.tween(
      { t: 0 },
      {
        t: 1,
        duration: 2,
        onComplete: () => {
          this.rushing = false;
        },
      }
    );
  }

  private killRush() {
    this.tweens.forEach(t => t.kill());
    this.tweens = [];
  }

  private tween(target: object, vars: gsap.TweenVars) {
    const tween = gsap.to(target, vars);
    this.tweens.push(tween);
    return tween;
  }

  private syncEnv() {
    if (!this.envMixMat) return;
    this.envMixMat.uniforms.uWeight.value = this.params.envWeight;
    this.envMixMat.uniforms.uIntensity.value = this.params.envIntensity;
  }

  private blitEnv() {
    if (!this.envMix || !this.envMixMat) return;
    const prevTone = this.renderer.toneMapping;
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(this.envMix);
    this.renderer.render(this.envMixScene, this.envMixCamera);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.toneMapping = prevTone;
  }

  private syncLight() {
    if (this.lightMat) {
      const c = this.params.lightEmissive;
      this.lightMat.emissive.setRGB(c, c, c);
      this.lightMat.emissiveIntensity = c;
      this.lightMat.opacity = this.params.lightOpacity;
    }
    if (this.floorMat) {
      this.floorMat.lightMapIntensity = this.params.lightEmissive;
      const uniforms = this.floorMat.userData.uniforms;
      if (uniforms) uniforms.uReflectIntensity.value = this.params.reflectIntensity;
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.controlsEnabled) return;
    this.dragging = true;
    this.lastPointer.x = event.clientX;
    this.lastPointer.y = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.setPressed(true);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging || !this.controlsEnabled) return;
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.lastPointer.x = event.clientX;
    this.lastPointer.y = event.clientY;
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.003, -0.1, 1.25);
  };

  private onPointerUp = (event: PointerEvent) => {
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    this.setPressed(false);
  };

  private onWheel = (event: WheelEvent) => {
    if (!this.controlsEnabled) return;
    event.preventDefault();
    const min = 4.5;
    const max = DEFAULT_DISTANCE + 4;
    const next = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.01, min, max);
    this.distance = next;
    if (!this.pressed) this.targetDistance = next;
  };

  private applyCam() {
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    const e = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    const offset = new THREE.Vector3(0, 0, this.distance).applyEuler(e);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = this.timer.getDelta();

    this.blitEnv();

    this.speed = lerp(this.speed, this.targetSpeed, Math.min(1, this.speedLerp * dt));
    if (this.introDone) {
      this.fov = lerp(this.fov, this.targetFov, Math.min(1, this.camLerp * dt));
      this.distance = lerp(this.distance, this.targetDistance, Math.min(1, this.camLerp * dt));
    }
    this.speedTime += dt * this.speed * 0.2;
    this.floorUvOffset += this.speed * dt;

    if (this.speedupRoot) this.speedupRoot.visible = this.speed >= 0.1;
    if (this.speedupMat) {
      this.speedupMat.uniforms.uTime.value = this.speedTime;
      this.speedupMat.uniforms.uSpeed.value = this.speed;
    }
    if (this.floorMat?.userData.uniforms) {
      const u = this.floorMat.userData.uniforms;
      u.uFloorOffset.value = this.floorUvOffset;
      u.uColor.value.copy(this.params.floorColor);
      if (this.reflector) {
        u.uReflectMatrix.value.copy(this.reflector.matrix);
        u.uReflectTexture.value = this.reflector.texture;
      }
    }
    if (this.bodyMats.length) {
      for (const mat of this.bodyMats) mat.envMapIntensity = this.params.bodyEnv;
    }
    this.cubeBoostUniform.value = THREE.MathUtils.clamp(this.speed / 6, 0, 0.55);
    if (this.bloom) {
      this.bloom.strength = this.params.bloom;
      this.bloom.threshold = this.params.bloomThreshold;
    }

    const wheelStep = (-this.speed * dt * 2 * Math.PI) / (Math.PI * 0.737774);
    for (const wheel of this.wheels) {
      wheel.rotateX(wheelStep);
    }

    this.applyCam();
    const shakeScale = this.speed / 5;
    if (shakeScale > 0.02) {
      const amp = 0.04 * (1 / 0.75) * shakeScale;
      for (let i = 0; i < 3; i++) this.noiseTime[i] += 1.5 * dt;
      const fbm = (x: number) => Math.sin(x) * 0.5 + Math.sin(x * 2.17) * 0.25 + Math.sin(x * 4.33) * 0.125;
      this.camera.position.x += fbm(this.noiseTime[0]) * amp;
      this.camera.position.y += fbm(this.noiseTime[1]) * amp;
      this.camera.position.z += fbm(this.noiseTime[2]) * amp;
    }

    if (this.reflector && this.floorMesh) {
      this.floorMesh.visible = false;
      this.reflector.update(this.camera);
      this.floorMesh.visible = true;
    }

    if (this.speed > 0.08 && this.cubeCamera && this.cubeRT) {
      const hidden: THREE.Object3D[] = [];
      const hide = (obj?: THREE.Object3D) => {
        if (!obj || !obj.visible) return;
        obj.visible = false;
        hidden.push(obj);
      };
      hide(this.carRoot);
      hide(this.roomRoot);
      if (this.speedupRoot) this.speedupRoot.visible = true;
      const prevTone = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.cubeCamera.position.copy(this.target);
      this.cubeCamera.update(this.renderer, this.scene);
      this.renderer.toneMapping = prevTone;
      hidden.forEach(obj => {
        obj.visible = true;
      });
    }

    this.composer.render();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.killRush();
    gsap.killTweensOf(this);
    this.audio?.pause();
    this.reflector?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
