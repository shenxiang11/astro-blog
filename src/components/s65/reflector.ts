import * as THREE from "three";

export class GroundReflector {
  readonly matrix = new THREE.Matrix4();
  readonly texture: THREE.Texture;
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly plane = new THREE.Plane();
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly ignore: THREE.Object3D[];

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly parent: THREE.Object3D,
    resolution = 1024,
    ignore: THREE.Object3D[] = []
  ) {
    this.ignore = ignore;
    this.rt = new THREE.WebGLRenderTarget(resolution, resolution, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
    });
    this.texture = this.rt.texture;
  }

  update(viewer: THREE.PerspectiveCamera) {
    this.plane.set(new THREE.Vector3(0, 1, 0), 0);
    this.plane.applyMatrix4(this.parent.matrixWorld);

    this.camera.copy(viewer);
    const normal = this.plane.normal;
    const view = viewer.getWorldPosition(new THREE.Vector3());
    const reflectDir = new THREE.Vector3(0, 0, 1).negate();
    reflectDir.reflect(normal);

    const projected = new THREE.Vector3();
    this.plane.projectPoint(view, projected);
    const camPos = projected.clone().sub(view).add(projected);
    this.camera.position.copy(camPos);

    const target = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(viewer.getWorldQuaternion(new THREE.Quaternion()))
      .add(view);
    const look = this.parent.getWorldPosition(new THREE.Vector3()).sub(target);
    look.reflect(normal).negate();
    look.add(this.parent.getWorldPosition(new THREE.Vector3()));

    this.camera.up.set(0, 1, 0);
    this.camera.applyQuaternion(viewer.getWorldQuaternion(new THREE.Quaternion()));
    this.camera.up.reflect(normal);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();

    const texMatrix = new THREE.Matrix4().set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1
    );
    texMatrix.multiply(this.camera.projectionMatrix);
    texMatrix.multiply(this.camera.matrixWorldInverse);
    this.matrix.copy(texMatrix);

    const clipPlane = this.plane.clone();
    clipPlane.applyMatrix4(this.camera.matrixWorldInverse);
    const clip = new THREE.Vector4(
      clipPlane.normal.x,
      clipPlane.normal.y,
      clipPlane.normal.z,
      clipPlane.constant
    );
    const proj = this.camera.projectionMatrix;
    const q = new THREE.Vector4();
    q.x = (Math.sign(clip.x) + proj.elements[8]) / proj.elements[0];
    q.y = (Math.sign(clip.y) + proj.elements[9]) / proj.elements[5];
    q.z = -1;
    q.w = (1 + proj.elements[10]) / proj.elements[14];
    clip.multiplyScalar(2 / clip.dot(q));
    proj.elements[2] = clip.x;
    proj.elements[6] = clip.y;
    proj.elements[10] = clip.z + 1;
    proj.elements[14] = clip.w;

    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.state.buffers.depth.setMask(true);
    this.renderer.clear();
    for (const obj of this.ignore) obj.visible = false;
    this.renderer.render(this.scene, this.camera);
    for (const obj of this.ignore) obj.visible = true;
    this.renderer.setRenderTarget(prev);
  }

  dispose() {
    this.rt.dispose();
  }
}
