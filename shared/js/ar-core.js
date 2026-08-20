// ============================================================================
// AR-CORE.JS (ES module)
// Logik teras yang dikongsi antara learn.html dan quiz.html:
// - bina model + hotspot untuk satu item (dari data Sheet)
// - jalankan sesi AR (banyak anchor serentak - satu setiap item dalam topik)
// - jalankan sesi 3D (satu model pada satu masa, guna OrbitControls)
// ============================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

window.THREE = THREE; // models.js (script biasa, bukan module) guna THREE global ini

export function addLights(scene){
  const amb = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(1, 2, 1.5);
  scene.add(dir);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.4);
  rim.position.set(-1.5, 0.5, -1);
  scene.add(rim);
}

// letak hotspot marker (bulatan kecil) berdasarkan data dari Sheet.
// kalau pos_x/y/z semua 0 atau kosong, agihkan automatik dalam bulatan
// kecil supaya tak bertindih (fallback untuk hotspot yang belum diletak manual).
export function attachHotspots(group, hotspots){
  const meshes = [];
  hotspots.forEach((hs, i) => {
    let x = Number(hs.pos_x) || 0, y = Number(hs.pos_y) || 0, z = Number(hs.pos_z) || 0;
    if (x === 0 && y === 0 && z === 0) {
      const angle = (i / Math.max(hotspots.length, 1)) * Math.PI * 2;
      x = Math.cos(angle) * 0.25;
      y = 0.1 + (i % 2) * 0.1;
      z = Math.sin(angle) * 0.25;
    }
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a })
    );
    marker.position.set(x, y, z);
    marker.userData.isHotspot = true;
    group.add(marker);
    meshes.push({ mesh: marker, label: hs.label, info: hs.info_text });
  });
  return meshes;
}

export function buildItemVisual(item){
  const group = buildModelByRef(THREE, item.model_ref); // dari models.js (global)
  const hotspotMeshes = attachHotspots(group, item.hotspots || []);
  return { group, hotspotMeshes };
}

function makeRaycastHandler(camera, getMeshMap, onHit){
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  return function onPointerDown(ev){
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    pointer.x = (x / window.innerWidth) * 2 - 1;
    pointer.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshMap = getMeshMap();
    const hits = raycaster.intersectObjects(meshMap.map(m => m.mesh), false);
    if (hits.length){
      const hit = meshMap.find(m => m.mesh === hits[0].object);
      if (hit) onHit(hit);
    }
  };
}

// ==================== 3D MODE (no camera) ====================
export function start3DViewer(container, item, { onHotspotClick } = {}){
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.01, 100);
  camera.position.set(0, 0.3, 1.6);
  addLights(scene);

  const { group, hotspotMeshes } = buildItemVisual(item);
  scene.add(group);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.6;
  controls.maxDistance = 3.5;

  const onPointerDown = makeRaycastHandler(camera, () => hotspotMeshes, (hit) => {
    if (onHotspotClick) onHotspotClick(hit);
  });
  renderer.domElement.addEventListener("click", onPointerDown);
  renderer.domElement.addEventListener("touchstart", onPointerDown, { passive: true });

  function onResize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    if (group.userData.idleSpin) group.rotation.y = t * group.userData.idleSpin;
    if (group.userData.flicker) group.userData.flicker.intensity = 1.1 + Math.sin(t*30)*0.15 + (Math.random()-0.5)*0.2;
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    stop(){
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onPointerDown);
      renderer.domElement.removeEventListener("touchstart", onPointerDown);
      container.innerHTML = "";
    }
  };
}

// ==================== AR MODE (camera, multi-anchor: satu setiap item) ====
export async function startARViewer(container, topicId, items, {
  onTargetFound,   // (item) => void
  onTargetLost,    // (item) => void
  onHotspotClick,  // (hit) => void
  onError          // (err) => void
} = {}){
  let MindARThree;
  try {
    ({ MindARThree } = await import("mindar-image-three"));
  } catch (err) {
    onError && onError(err);
    return null;
  }

  const mindarThree = new MindARThree({
    container,
    imageTargetSrc: `../targets/${topicId}.mind`
  });
  const { renderer, scene, camera } = mindarThree;
  addLights(scene);

  const allHotspotMeshes = [];
  const itemsByIndex = {};

  items.forEach(item => {
    const anchor = mindarThree.addAnchor(Number(item.target_index));
    const { group, hotspotMeshes } = buildItemVisual(item);
    group.scale.set(0.5, 0.5, 0.5);
    anchor.group.add(group);
    itemsByIndex[item.target_index] = item;

    anchor.onTargetFound = () => onTargetFound && onTargetFound(item);
    anchor.onTargetLost = () => onTargetLost && onTargetLost(item);

    hotspotMeshes.forEach(h => allHotspotMeshes.push(h));
  });

  const onPointerDown = makeRaycastHandler(camera, () => allHotspotMeshes, (hit) => {
    if (onHotspotClick) onHotspotClick(hit);
  });
  container.addEventListener("click", onPointerDown);
  container.addEventListener("touchstart", onPointerDown, { passive: true });

  try {
    await mindarThree.start();
  } catch (err) {
    onError && onError(err);
    return null;
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });

  return {
    stop(){
      try {
        renderer.setAnimationLoop(null);
        mindarThree.stop();
      } catch(e){ /* noop */ }
      container.removeEventListener("click", onPointerDown);
      container.removeEventListener("touchstart", onPointerDown);
      container.innerHTML = "";
    }
  };
}
