/* Ported from yuanyang749/softie-webgpu (MIT)
 * https://github.com/yuanyang749/softie-webgpu
 */
// @ts-nocheck
import * as THREE from 'three/webgpu';
import { float, uv } from 'three/tsl';

// A baked studio reflection rig: one WebGPU PMREM at startup, no runtime shadows.
export function makeStudio(renderer, scene) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0xe9e7e5);
  const cards = [];
  const addCard = (x, y, z, w, h, strength) => {
    const material = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(strength, strength, strength) });
    // A rounded softbox keeps a crisp reflection core with feathered edges.
    const q = uv().sub(0.5).mul(2).abs().pow(4);
    const feather = q.x.add(q.y).pow(0.25).smoothstep(0.7, 1).oneMinus();
    material.colorNode = float(0.8).add(feather.mul(strength));
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    card.position.set(x, y, z);
    card.lookAt(0, 0, 0);
    studio.add(card);
    cards.push(card);
  };
  addCard(-4.5, 5, 3, 3.2, 5.5, 12.0);
  addCard(4.5, 3, 2, 1.6, 5, 9.0);
  addCard(-1, 1, -5, 3, 3, 1.2);
  // Narrow negative-fill flags give glass edges contrast without a gray ambient wash.
  addCard(-6, -0.5, -2, 1.5, 5, -0.45);
  addCard(6, -0.5, -2, 1.5, 5, -0.45);
  addCard(0, -4, 0, 9, 7, 0.7);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, 0.015, 0.1, 40, { size: 512 });
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.9;
  cards.forEach(card => { card.geometry.dispose(); card.material.dispose(); });
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-4, 6, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xf8faff, 0.8);
  fill.position.set(4, 3, 1);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e1e5, 1.1));

  const createLayer = (w, h, y, z, renderOrder) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const map = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicNodeMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, y, z);
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
    return { canvas, ctx, map, material, mesh };
  };

  const shadow = createLayer(5.5, 3.5, 0.002, 0, -3);
  const colorProjection = createLayer(4.5, 2.7, 0.005, 0.33, -2);
  const contact = createLayer(3.8, 2.3, 0.007, 0.32, -1);

  function setColor(color) {
    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);

    // 1. Colored projection: soft, luminous translucent bleed under bottom rim (referencing Figure 1)
    const cctx = colorProjection.ctx;
    cctx.clearRect(0, 0, 256, 256);
    cctx.save();
    cctx.translate(128, 128);
    cctx.scale(1.0, 0.64);
    const cg = cctx.createRadialGradient(0, 0, 6, 0, 0, 122);
    cg.addColorStop(0, `rgba(${r},${g},${b},0.48)`);
    cg.addColorStop(0.32, `rgba(${r},${g},${b},0.34)`);
    cg.addColorStop(0.62, `rgba(${r},${g},${b},0.16)`);
    cg.addColorStop(0.85, `rgba(${r},${g},${b},0.04)`);
    cg.addColorStop(1, `rgba(${r},${g},${b},0)`);
    cctx.fillStyle = cg;
    cctx.fillRect(-128, -128 / 0.64, 256, 256 / 0.64);
    cctx.restore();
    colorProjection.map.needsUpdate = true;

    // 2. Contact shadow: deep tinted occlusion grounding the base
    const dr = Math.round(r * 0.22);
    const dg = Math.round(g * 0.22);
    const db = Math.round(b * 0.22);
    const cr = Math.round(dr * 0.75 + 15 * 0.25);
    const cg_ = Math.round(dg * 0.75 + 15 * 0.25);
    const cb = Math.round(db * 0.75 + 18 * 0.25);

    const kctx = contact.ctx;
    kctx.clearRect(0, 0, 256, 256);
    kctx.save();
    kctx.translate(128, 128);
    kctx.scale(1.0, 0.62);
    const kg = kctx.createRadialGradient(0, 0, 8, 0, 0, 120);
    kg.addColorStop(0, `rgba(${cr},${cg_},${cb},0.36)`);
    kg.addColorStop(0.3, `rgba(${cr + 20},${cg_ + 20},${cb + 20},0.22)`);
    kg.addColorStop(0.65, `rgba(${cr + 40},${cg_ + 40},${cb + 40},0.07)`);
    kg.addColorStop(1, `rgba(${cr + 50},${cg_ + 50},${cb + 50},0)`);
    kctx.fillStyle = kg;
    kctx.fillRect(-128, -128 / 0.62, 256, 256 / 0.62);
    kctx.restore();
    contact.map.needsUpdate = true;

    // 3. Ambient shadow: broad diffuse base
    const sctx = shadow.ctx;
    sctx.clearRect(0, 0, 256, 256);
    sctx.save();
    sctx.translate(128, 128);
    sctx.scale(1.0, 0.64);
    const sg = sctx.createRadialGradient(0, 0, 8, 0, 0, 124);
    sg.addColorStop(0, `rgba(${cr + 15},${cg_ + 15},${cb + 15},0.22)`);
    sg.addColorStop(0.35, `rgba(${cr + 35},${cg_ + 35},${cb + 35},0.14)`);
    sg.addColorStop(0.7, `rgba(${cr + 55},${cg_ + 55},${cb + 55},0.05)`);
    sg.addColorStop(1, `rgba(${cr + 65},${cg_ + 65},${cb + 65},0)`);
    sctx.fillStyle = sg;
    sctx.fillRect(-128, -128 / 0.64, 256, 256 / 0.64);
    sctx.restore();
    shadow.map.needsUpdate = true;
  }

  setColor('#f17fa9');

  return {
    setColor,
    update(position) {
      shadow.mesh.position.x = position.x;
      shadow.mesh.position.z = position.z;
      shadow.mesh.scale.setScalar(1 + position.y * 0.16);
      shadow.material.opacity = Math.max(0.14, 1 - position.y * 0.24);

      colorProjection.mesh.position.x = position.x;
      colorProjection.mesh.position.z = position.z + 0.33;
      colorProjection.mesh.scale.setScalar(1 + position.y * 0.12);
      colorProjection.material.opacity = 0.95 * Math.exp(-position.y * 4.5);

      contact.mesh.position.x = position.x;
      contact.mesh.position.z = position.z + 0.32;
      contact.material.opacity = 0.85 * Math.exp(-position.y * 5);
    },
    dispose() {
      environment.dispose();
      [shadow, colorProjection, contact].forEach(layer => {
        layer.map.dispose();
        layer.mesh.geometry.dispose();
        layer.material.dispose();
      });
    },
  };
}
