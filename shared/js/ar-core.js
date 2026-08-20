// ============================================================================
// AR-CORE.JS (ES module)
// ArUco version. Guna js-aruco2 (global AR / POS / CV / SVD, dimuat sebagai
// <script> biasa dalam learn.html/quiz.html SEBELUM fail ini) untuk kesan
// penanda ArUco dari kamera terus, tanpa perlu compile fail .mind.
//
// item.target_index = ID sebenar penanda ArUco yang dicetak pada kad
// (bukan lagi "urutan compile" macam versi MindAR dahulu).
// ============================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

window.THREE = THREE; // models.js (script biasa) guna THREE global ini

// Satu "unit" saiz penanda = 1 unit skala Three.js (bukan mm sebenar) -
// ini elak keperluan ukur kad sebenar; kalau model nampak terlalu besar/kecil
// berbanding kad, laraskan group.scale dalam attachHotspots/buildItemVisual
// atau constant MODEL_SCALE di bawah.
const MARKER_UNIT_SIZE = 1;
const MODEL_SCALE = 0.5;
const LOST_GRACE_FRAMES = 5; // toleransi bingkai hilang sebelum model disorokkan (elak kelipan)

// tetapan flip default untuk tukar paksi output pose js-aruco2 -> Three.js.
// INI MUNGKIN PERLU DILARASKAN semasa ujian langsung dengan kamera sebenar -
// guna panel "Debug AR" (butang kecil bawah kiri skrin AR) untuk toggle live,
// nilai akan disimpan dalam localStorage peranti tersebut.
const DEFAULT_FLIP = { x: false, y: true, z: true };

function loadFlipConfig(){
  try {
    const saved = JSON.parse(localStorage.getItem("arFlipConfig"));
    if (saved) return { ...DEFAULT_FLIP, ...saved };
  } catch(e) { /* noop */ }
  return { ...DEFAULT_FLIP };
}
function saveFlipConfig(cfg){
  localStorage.setItem("arFlipConfig", JSON.stringify(cfg));
}

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

// ==================== 3D MODE (no camera) - unchanged ====================
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

// ==================== AR MODE (kamera + pengesanan ArUco) =================
function buildPoseMatrix(rotation, translation, flip){
  const sx = flip.x ? -1 : 1;
  const sy = flip.y ? -1 : 1;
  const sz = flip.z ? -1 : 1;
  const m = new THREE.Matrix4();
  m.set(
    rotation[0][0]*sx, rotation[0][1]*sx, rotation[0][2]*sx, translation[0]*sx,
    rotation[1][0]*sy, rotation[1][1]*sy, rotation[1][2]*sy, translation[1]*sy,
    rotation[2][0]*sz, rotation[2][1]*sz, rotation[2][2]*sz, translation[2]*sz,
    0, 0, 0, 1
  );
  return m;
}

function buildDebugPanel(container, flipConfig, onChange){
  const btn = document.createElement("button");
  btn.textContent = "⚙ Debug AR";
  btn.style.cssText = "position:absolute;bottom:14px;left:14px;z-index:9;font-family:monospace;font-size:10px;padding:6px 10px;background:rgba(0,0,0,.6);color:#a8a8ac;border:1px solid #333;border-radius:20px;cursor:pointer;";
  const panel = document.createElement("div");
  panel.style.cssText = "position:absolute;bottom:50px;left:14px;z-index:9;background:rgba(15,15,17,.95);border:1px solid #333;border-radius:4px;padding:12px 14px;display:none;font-family:monospace;font-size:11px;color:#f2f1ee;min-width:180px;";
  panel.innerHTML = `
    <div style="color:#ff7a1a;text-transform:uppercase;font-size:10px;letter-spacing:.08em;margin-bottom:8px;">Laras Orientasi</div>
    <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><input type="checkbox" id="flip-x"> Flip X</label>
    <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><input type="checkbox" id="flip-y"> Flip Y</label>
    <label style="display:flex;align-items:center;gap:6px;margin-bottom:2px;"><input type="checkbox" id="flip-z"> Flip Z</label>
    <p style="font-size:9.5px;color:#a8a8ac;margin:8px 0 0;line-height:1.5;">Toggle kalau model terbalik/oglek/tersalah arah berbanding kad.</p>
  `;
  container.appendChild(btn);
  container.appendChild(panel);
  btn.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
  ["x","y","z"].forEach(axis => {
    const cb = panel.querySelector(`#flip-${axis}`);
    cb.checked = !!flipConfig[axis];
    cb.addEventListener("change", () => { flipConfig[axis] = cb.checked; saveFlipConfig(flipConfig); onChange(); });
  });
  return { btn, panel };
}

export async function startARViewer(container, topicId, items, {
  onTargetFound,   // (item) => void
  onTargetLost,    // (item) => void
  onHotspotClick,  // (hit) => void
  onError          // (err) => void
} = {}){
  if (typeof AR === "undefined" || typeof POS === "undefined") {
    onError && onError(new Error("js-aruco2 tidak dimuat (semak <script> tags dalam <head>)"));
    return null;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
  } catch (err) {
    onError && onError(err);
    return null;
  }

  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.muted = true;
  video.autoplay = true;
  video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
  video.srcObject = stream;
  container.appendChild(video);
  await video.play().catch(() => {});
  await new Promise(res => {
    if (video.videoWidth) return res();
    video.addEventListener("loadedmetadata", res, { once: true });
  });

  const dw = video.videoWidth || 640, dh = video.videoHeight || 480;
  const detectionCanvas = document.createElement("canvas");
  detectionCanvas.width = dw; detectionCanvas.height = dh;
  const dctx = detectionCanvas.getContext("2d", { willReadFrequently: true });

  const glCanvas = document.createElement("canvas");
  glCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(glCanvas);

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const focalLength = dw; // andaian standard bila tiada kalibrasi kamera sebenar
  const vFov = 2 * Math.atan((dh/2) / focalLength) * (180/Math.PI);
  const camera = new THREE.PerspectiveCamera(vFov, dw/dh, 0.01, 100);

  const scene = new THREE.Scene();
  addLights(scene);

  const detector = new AR.Detector({ dictionaryName: "ARUCO" });
  const posit = new POS.Posit(MARKER_UNIT_SIZE, dw);

  const groupsByMarkerId = {};
  const allHotspotMeshes = [];
  const lostCounters = {};
  const wasVisible = {};

  items.forEach(item => {
    const { group, hotspotMeshes } = buildItemVisual(item);
    group.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    group.matrixAutoUpdate = false;
    group.visible = false;
    scene.add(group);
    groupsByMarkerId[Number(item.target_index)] = { group, item };
    lostCounters[item.item_id] = 0;
    wasVisible[item.item_id] = false;
    hotspotMeshes.forEach(h => allHotspotMeshes.push(h));
  });

  const flipConfig = loadFlipConfig();
  buildDebugPanel(container, flipConfig, () => {});

  const onPointerDown = makeRaycastHandler(camera, () => allHotspotMeshes, (hit) => {
    if (onHotspotClick) onHotspotClick(hit);
  });
  container.addEventListener("click", onPointerDown);
  container.addEventListener("touchstart", onPointerDown, { passive: true });

  function onResize(){
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  let running = true;
  function frame(){
    if (!running) return;
    dctx.drawImage(video, 0, 0, dw, dh);
    const imageData = dctx.getImageData(0, 0, dw, dh);
    const markers = detector.detect(imageData);
    const seenIds = new Set();

    markers.forEach(marker => {
      seenIds.add(marker.id);
      const entry = groupsByMarkerId[marker.id];
      if (!entry) return; // penanda dikesan tapi tiada item dikaitkan dengannya

      const corners = marker.corners.map(c => ({
        x: c.x - dw/2,
        y: dh/2 - c.y
      }));
      const pose = posit.pose(corners);
      if (!pose) return;
      const m = buildPoseMatrix(pose.bestRotation, pose.bestTranslation, flipConfig);
      entry.group.matrix.copy(m);
      entry.group.visible = true;
      lostCounters[entry.item.item_id] = 0;
      if (!wasVisible[entry.item.item_id]) {
        wasVisible[entry.item.item_id] = true;
        onTargetFound && onTargetFound(entry.item);
      }
    });

    // items yang tak dikesan bingkai ini - beri toleransi sebelum sorok
    Object.values(groupsByMarkerId).forEach(({ group, item }) => {
      if (seenIds.has(Number(item.target_index))) return;
      lostCounters[item.item_id] += 1;
      if (lostCounters[item.item_id] > LOST_GRACE_FRAMES && wasVisible[item.item_id]) {
        group.visible = false;
        wasVisible[item.item_id] = false;
        onTargetLost && onTargetLost(item);
      }
    });

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    stop(){
      running = false;
      stream.getTracks().forEach(t => t.stop());
      window.removeEventListener("resize", onResize);
      container.removeEventListener("click", onPointerDown);
      container.removeEventListener("touchstart", onPointerDown);
      container.innerHTML = "";
    }
  };
}
