/* Ported from yuanyang749/softie-webgpu (MIT)
 * https://github.com/yuanyang749/softie-webgpu
 */
// @ts-nocheck
import * as THREE from "three/webgpu";
import { JellyPhysics } from "./physics";
import { makeSlime } from "./slime";
import { makeStudio } from "./studio";
import { sound } from "./sound";

export type SoftieStatus = "pending" | "ready" | "error";

export type SoftieErrorKey =
  | "gpuUnsupported"
  | "nativeRequired"
  | "deviceLost"
  | "initFailed";

export type SoftieCallbacks = {
  onStatus: (status: SoftieStatus) => void;
  onError: (key: SoftieErrorKey) => void;
  onFps: (fps: number | null) => void;
  onInteraction: (state: "idle" | "grabbing") => void;
};

export class SoftieExperience {
  private disposed = false;
  private ready = false;
  private isDizzyPending = false;
  private cleanup: Array<() => void> = [];

  readonly physics = new JellyPhysics();
  readonly sound = sound;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement,
    private callbacks: SoftieCallbacks
  ) {
    this.physics.onLand = impact => {
      if (!this.ready) return;
      if (this.isDizzyPending) {
        this.isDizzyPending = false;
        sound.playDizzyLand(impact);
        this.slime?.faceMotion.react("dizzy");
      } else {
        sound.playLand(impact);
      }
    };
    this.physics.onEntryComplete = () => {
      this.slime?.faceMotion.react("happy");
      sound.playWakeup();
    };
  }

  private slime: ReturnType<typeof makeSlime> | null = null;
  private studio: ReturnType<typeof makeStudio> | null = null;

  poke() {
    if (!this.ready) return;
    this.physics.poke();
    this.slime?.faceMotion.react("surprised");
    sound.playPoke();
  }

  setColor(color: string) {
    this.slime?.setColor(color);
    this.studio?.setColor(color);
    this.slime?.faceMotion.react("wink");
  }

  setStiffness(stiffness: number) {
    this.physics.setConfig({ stiffness });
  }

  setDamping(damping: number) {
    this.physics.setConfig({ damping });
  }

  reset(color = "#f17fa9") {
    this.isDizzyPending = false;
    this.physics.reset();
    this.slime?.setColor(color);
    this.studio?.setColor(color);
    this.slime?.faceMotion.reset();
  }

  wakeup() {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      sound.playWakeup();
    } else {
      this.physics.startEntry();
    }
  }

  async start() {
    if (!navigator.gpu) throw new Error("gpuUnsupported");
    const { canvas, stage } = this;
    const renderer = new THREE.Renderer(
      new THREE.WebGPUBackend({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }),
      { antialias: true, alpha: false, getFallback: null }
    );
    renderer.library = new THREE.StandardNodeLibrary();
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor("#f5f5f3", 1);
    await renderer.init();
    if (this.disposed) {
      renderer.dispose();
      return;
    }
    if (!renderer.backend.isWebGPUBackend) throw new Error("nativeRequired");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f5f5f3");
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    const studio = makeStudio(renderer, scene);
    studio.setColor("#f17fa9");
    const slime = makeSlime(this.physics, scene.environment);
    scene.add(slime.group);
    this.studio = studio;
    this.slime = slime;

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    const syncMotionPreference = () => {
      slime.faceMotion.reducedMotion = reducedMotion.matches;
    };
    syncMotionPreference();
    reducedMotion.addEventListener("change", syncMotionPreference);
    this.cleanup.push(() =>
      reducedMotion.removeEventListener("change", syncMotionPreference)
    );

    let dpr = Math.min(devicePixelRatio, 2);
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const { width, height } = rect;
      const desktop = window.innerWidth >= 900;
      const left = Math.max(0, rect.left);
      const top = desktop ? Math.max(0, rect.top) : 0;
      const right = Math.max(
        0,
        (desktop ? window.innerWidth * 0.744 - 12 : window.innerWidth) - rect.right
      );
      const bottom = desktop ? Math.max(0, window.innerHeight - rect.bottom) : 0;
      const canvasWidth = width + left + right;
      const canvasHeight = height + top + bottom;
      Object.assign(canvas.style, {
        position: "absolute",
        left: `${-left}px`,
        top: `${-top}px`,
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
      });
      renderer.setPixelRatio(dpr);
      renderer.setSize(canvasWidth, canvasHeight, false);
      camera.aspect = width / height;
      const visibleHeight = Math.max(
        desktop ? 3.25 : 3.85,
        (desktop ? 4.12 : 4.45) / camera.aspect
      );
      const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(16)));
      const camY = desktop ? 1.1 + distance * 0.15 : 1.3 + distance * 0.12;
      const lookAtY = desktop ? 1.03 : 1.22;
      camera.position.set(0.19, camY, distance);
      camera.lookAt(0.19, lookAtY, 0);
      camera.setViewOffset(width, height, -left, -top, canvasWidth, canvasHeight);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    this.cleanup.push(() => observer.disconnect());

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane();
    const worldTarget = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const gazeOrigin = new THREE.Vector3();
    const clearGaze = () => slime.faceMotion.lookAt(0, 0);
    const followPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches) {
        clearGaze();
        return;
      }
      const r = canvas.getBoundingClientRect();
      this.physics.deform(0, 1.2, 1.15, gazeOrigin);
      gazeOrigin.add(slime.group.position).project(camera);
      const x = r.left + ((gazeOrigin.x + 1) * r.width) / 2;
      const y = r.top + ((1 - gazeOrigin.y) * r.height) / 2;
      slime.faceMotion.lookAt(
        (event.clientX - x) / (r.width * 0.24),
        (y - event.clientY) / (r.height * 0.24)
      );
    };
    window.addEventListener("pointermove", followPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", clearGaze);
    this.cleanup.push(() => {
      window.removeEventListener("pointermove", followPointer);
      document.documentElement.removeEventListener("pointerleave", clearGaze);
    });

    let pointerId: number | null = null;
    let pressTime = 0;
    let pressX = 0;
    let pressY = 0;
    let moved = false;
    let lastMoveTime = 0;
    let lastMoveX = 0;
    let lastMoveY = 0;
    let maxStretchDist = 0;
    let shakePathDist = 0;
    let shakeWindowStart = 0;
    let shakeStartX = 0;
    let shakeStartY = 0;
    let dizzyUntil = 0;
    let dizzyPendingUntil = 0;
    const ray = (event: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (pointerId !== null || event.button !== 0) return;
      ray(event);
      const hit = raycaster.intersectObject(slime.body, false)[0];
      if (!hit) return;
      pointerId = event.pointerId;
      pressTime = performance.now();
      pressX = event.clientX;
      pressY = event.clientY;
      moved = false;
      lastMoveTime = performance.now();
      lastMoveX = event.clientX;
      lastMoveY = event.clientY;
      maxStretchDist = 0;
      shakePathDist = 0;
      shakeWindowStart = performance.now();
      shakeStartX = event.clientX;
      shakeStartY = event.clientY;
      dizzyUntil = 0;
      dizzyPendingUntil = 0;
      this.isDizzyPending = false;
      canvas.setPointerCapture(pointerId);
      camera.getWorldDirection(normal);
      plane.setFromNormalAndCoplanarPoint(normal, hit.point);
      const local = hit.point.clone().sub(slime.group.position);
      this.physics.beginGrab(local, hit.point);
      slime.faceMotion.grab(true);
      this.callbacks.onInteraction("grabbing");
      sound.playSquish();
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== null) {
        if (event.pointerId !== pointerId) return;
        const now = performance.now();
        const dt = Math.max(1, now - lastMoveTime);
        const dx = event.clientX - lastMoveX;
        const dy = event.clientY - lastMoveY;
        const moveDist = Math.hypot(dx, dy);
        const speed = moveDist / dt;
        lastMoveTime = now;
        lastMoveX = event.clientX;
        lastMoveY = event.clientY;

        const totalDist = Math.hypot(event.clientX - pressX, event.clientY - pressY);
        if (totalDist > 8) moved = true;

        if (now - shakeWindowStart > 420) {
          shakeWindowStart = now;
          shakeStartX = event.clientX;
          shakeStartY = event.clientY;
          shakePathDist = 0;
        }

        if (speed > 0.6) {
          shakePathDist += moveDist;
        }

        const netDist = Math.hypot(
          event.clientX - shakeStartX,
          event.clientY - shakeStartY
        );
        const turnaround = shakePathDist - netDist;

        if (turnaround > 150 && shakePathDist > 220) {
          dizzyUntil = now + 650;
          this.isDizzyPending = true;
          dizzyPendingUntil = now + 2000;
          sound.playDizzy();
          shakeWindowStart = now;
          shakeStartX = event.clientX;
          shakeStartY = event.clientY;
          shakePathDist = 0;
        }

        const isDizzy = now < dizzyUntil;
        if (!isDizzy && totalDist > 32 && totalDist > maxStretchDist + 8) {
          maxStretchDist = totalDist;
          const stretchRatio = Math.min(1.0, (totalDist - 25) / 170);
          sound.playStretch(stretchRatio);
        } else if (totalDist < maxStretchDist - 25) {
          maxStretchDist = totalDist + 10;
        }

        ray(event);
        if (raycaster.ray.intersectPlane(plane, worldTarget)) {
          this.physics.moveGrab(worldTarget);
        }
        return;
      }
      ray(event);
      const hit = raycaster.intersectObject(slime.body, false).length > 0;
      canvas.style.cursor = hit ? "grab" : "default";
    };
    const triggerDizzyLand = (impact = 1.3) => {
      if (!this.isDizzyPending) return;
      this.isDizzyPending = false;
      sound.playDizzyLand(impact);
      slime?.faceMotion.react("dizzy");
    };
    const release = (event?: PointerEvent | Event) => {
      const pointerEvent = event as PointerEvent | undefined;
      if (
        pointerId === null ||
        (pointerEvent?.pointerId !== undefined && pointerEvent.pointerId !== pointerId)
      ) {
        return;
      }
      const id = pointerId;
      pointerId = null;
      dizzyUntil = 0;
      this.physics.endGrab();

      const willBeDizzy =
        this.isDizzyPending && performance.now() < dizzyPendingUntil;
      const shouldCelebrate = pointerEvent?.type === "pointerup" && !willBeDizzy;
      slime.faceMotion.grab(false, shouldCelebrate);

      if (pointerEvent?.type === "pointerup") {
        if (!moved && performance.now() - pressTime < 160) this.poke();
        else sound.playBounce(moved ? 1.15 : 0.8);
      }

      if (willBeDizzy) {
        let settled = false;
        const checkLand = () => {
          if (settled) return;
          if (this.physics.position.y <= 0.08 || !this.isDizzyPending) {
            settled = true;
            triggerDizzyLand(1.3);
          }
        };
        const timer = setInterval(checkLand, 16);
        const timeout = setTimeout(() => {
          settled = true;
          clearInterval(timer);
        }, 900);
        this.cleanup.push(() => {
          settled = true;
          clearInterval(timer);
          clearTimeout(timeout);
        });
      } else {
        this.isDizzyPending = false;
      }

      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      this.callbacks.onInteraction("idle");
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("lostpointercapture", release);
    const onBlur = () => {
      release();
      clearGaze();
    };
    window.addEventListener("blur", onBlur);
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        /INPUT|BUTTON|TEXTAREA/.test((event.target as HTMLElement)?.tagName)
      ) {
        return;
      }
      event.preventDefault();
      this.poke();
    };
    window.addEventListener("keydown", onKeyDown);
    const unlockAudio = () => sound.resume();
    window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    this.cleanup.push(() => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("pointercancel", release);
      canvas.removeEventListener("lostpointercapture", release);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    });

    let lastActivity = performance.now();
    const registerActivity = () => {
      lastActivity = performance.now();
    };
    window.addEventListener("pointermove", registerActivity, { passive: true });
    window.addEventListener("pointerdown", registerActivity, { passive: true });
    window.addEventListener("keydown", registerActivity, { passive: true });
    this.cleanup.push(() => {
      window.removeEventListener("pointermove", registerActivity);
      window.removeEventListener("pointerdown", registerActivity);
      window.removeEventListener("keydown", registerActivity);
    });

    const ambientInterval = setInterval(() => {
      if (!this.ready || document.hidden || pointerId !== null) return;
      if (performance.now() - lastActivity > 12000) {
        sound.playAmbientBubble();
        lastActivity = performance.now() - 3000;
      }
    }, 3000);
    this.cleanup.push(() => clearInterval(ambientInterval));

    let frames = 0;
    let fps = 0;
    let previous = performance.now();
    let windowStart = previous;
    let windowFrames = 0;
    let time = 0;
    let slowWindows = 0;
    slime.update(0);
    await renderer.compileAsync(scene, camera);
    if (this.disposed) {
      slime.dispose();
      studio.dispose();
      renderer.dispose();
      return;
    }
    this.ready = true;
    this.callbacks.onStatus("ready");
    renderer.setAnimationLoop((now: number) => {
      const elapsed = now - previous;
      previous = now;
      if (document.hidden) return;
      const dt = Math.min(Math.max(elapsed / 1000, 0), 1 / 15);
      time += dt;
      this.physics.update(dt);
      slime.update(time);
      studio.update(this.physics.position);
      renderer.render(scene, camera);
      frames++;
      windowFrames++;
      if (now - windowStart >= 1000) {
        fps = (windowFrames * 1000) / (now - windowStart);
        this.callbacks.onFps(fps);
        if (fps < 52 && frames > 180) slowWindows++;
        else slowWindows = 0;
        if (slowWindows >= 3 && dpr > 1) {
          dpr = Math.max(1, dpr - 0.25);
          resize();
          slowWindows = 0;
        }
        windowStart = now;
        windowFrames = 0;
      }
    });
    renderer.backend.device.lost.then((info: { reason?: string }) => {
      if (info.reason === "destroyed" || this.disposed) return;
      this.ready = false;
      renderer.setAnimationLoop(null);
      this.callbacks.onError("deviceLost");
    });
    const onVisibility = () => {
      previous = performance.now();
      windowStart = previous;
      windowFrames = 0;
      if (document.hidden) {
        release();
        clearGaze();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanup.push(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.setAnimationLoop(null);
      slime.dispose();
      studio.dispose();
      renderer.dispose();
    });
  }

  dispose() {
    this.disposed = true;
    this.ready = false;
    for (const fn of this.cleanup.splice(0)) fn();
    this.slime = null;
    this.studio = null;
  }
}
