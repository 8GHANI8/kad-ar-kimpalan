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
// ini elak keperluan ukur kad sebenar. MODEL_SCALE ialah default awal sahaja -
// boleh dilaraskan LIVE guna slider dalam panel "Debug AR" (cubit skrin pun
// boleh - lihat pinch-to-zoom di bawah), nilai tersimpan automatik.
const MARKER_UNIT_SIZE = 1;
const DEFAULT_MODEL_SCALE = 2.2;
const LOST_GRACE_FRAMES = 5; // toleransi bingkai hilang sebelum model disorokkan (elak kelipan)

// tetapan flip default untuk tukar paksi output pose js-aruco2 -> Three.js.
// INI MUNGKIN PERLU DILARASKAN semasa ujian langsung dengan kamera sebenar -
// guna panel "Debug AR" (butang kanan atas skrin AR) untuk toggle live,
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
function loadModelScale(){
  const saved = parseFloat(localStorage.getItem("arModelScale"));
  return isNaN(saved) ? DEFAULT_MODEL_SCALE : saved;
}
function saveModelScale(v){
  localStorage.setItem("arModelScale", String(v));
}

export function addLights(scene){
  const amb = new THREE.AmbientLight(0xffffff, 1.05);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(1, 2, 1.5);
  scene.add(dir);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
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
      new THREE.SphereGeometry(0.05, 16, 16),
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
  renderer.domElement.style.touchAction = "none"; // penting: elak browser 'curi' gesture drag/pinch

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.01, 100);
  addLights(scene);

  const { group, hotspotMeshes } = buildItemVisual(item);
  scene.add(group);

  // auto-fit kamera ikut saiz & pusat SEBENAR model (bukan andaikan model
  // sentiasa di (0,0,0) - model placeholder/glb kerap ada offset dalaman)
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.2);
  camera.position.set(center.x, center.y + radius * 0.3, center.z + radius * 2.4);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.minDistance = radius * 0.8;
  controls.maxDistance = radius * 8;
  controls.update();

  // penting: JANGAN auto-putar model semasa/sejurus selepas pengguna
  // sedang drag - kalau tidak, putaran automatik "melawan" input pengguna
  // setiap frame dan rasa macam langsung tak responsive.
  let userInteracting = false;
  let idleResumeAt = 0;
  controls.addEventListener("start", () => { userInteracting = true; });
  controls.addEventListener("end", () => { userInteracting = false; idleResumeAt = clock.getElapsedTime() + 1.2; });

  const onPointerDown = makeRaycastHandler(camera, () => hotspotMeshes, (hit) => {
    if (onHotspotClick) onHotspotClick(hit);
  });
  renderer.domElement.addEventListener("click", onPointerDown);
  renderer.domElement.addEventListener("touchend", onPointerDown, { passive: true });

  function onResize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    const dt = clock.getDelta();
    if (group.userData.idleSpin && !userInteracting && t > idleResumeAt) {
      group.rotation.y += group.userData.idleSpin * dt;
    }
    if (group.userData.flicker) group.userData.flicker.intensity = 1.1 + Math.sin(t*30)*0.15 + (Math.random()-0.5)*0.2;
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    stop(){
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onPointerDown);
      renderer.domElement.removeEventListener("touchend", onPointerDown);
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

function buildDebugPanel(container, flipConfig, onFlipChange, initialScale, onScaleChange){
  // diletak di kiri-atas, kawasan yang KOSONG semasa mod AR (item-picker
  // hanya papar dalam mod 3D, target-banner kuiz di tengah) - dan diberi
  // gaya paling menonjol (latar oren pejal) supaya mustahil terlepas pandang.
  const btn = document.createElement("button");
  btn.textContent = "⚙ LARAS AR";
  btn.style.cssText = "position:absolute;top:56px;left:14px;z-index:50;font-family:monospace;font-weight:600;font-size:13px;padding:10px 16px;background:#ff7a1a;color:#111;border:none;border-radius:24px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);";
  const panel = document.createElement("div");
  panel.style.cssText = "position:absolute;top:104px;left:14px;z-index:50;background:rgba(10,10,11,.97);border:2px solid #ff7a1a;border-radius:6px;padding:14px 16px;display:none;font-family:monospace;font-size:12px;color:#f2f1ee;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.6);";
  panel.innerHTML = `
    <div style="color:#ff7a1a;text-transform:uppercase;font-size:11px;letter-spacing:.08em;margin-bottom:10px;">Saiz Model</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <button id="scale-down" style="flex:0 0 auto;font-size:16px;width:32px;height:32px;background:#232326;color:#f2f1ee;border:1px solid #333;border-radius:4px;cursor:pointer;">−</button>
      <span id="scale-value" style="flex:1;text-align:center;">1.5x</span>
      <button id="scale-up" style="flex:0 0 auto;font-size:16px;width:32px;height:32px;background:#232326;color:#f2f1ee;border:1px solid #333;border-radius:4px;cursor:pointer;">+</button>
    </div>
    <p style="font-size:10px;color:#a8a8ac;margin:0 0 12px;">Atau cubit dua jari terus atas skrin.</p>
    <div style="color:#ff7a1a;text-transform:uppercase;font-size:11px;letter-spacing:.08em;margin-bottom:8px;">Laras Orientasi</div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><input type="checkbox" id="flip-x" style="width:16px;height:16px;"> Flip X</label>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><input type="checkbox" id="flip-y" style="width:16px;height:16px;"> Flip Y</label>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><input type="checkbox" id="flip-z" style="width:16px;height:16px;"> Flip Z</label>
    <p style="font-size:10px;color:#a8a8ac;margin:8px 0 0;line-height:1.5;">Toggle kalau model terbalik/tersalah arah berbanding kad.</p>
  `;
  container.appendChild(btn);
  container.appendChild(panel);
  btn.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });

  ["x","y","z"].forEach(axis => {
    const cb = panel.querySelector(`#flip-${axis}`);
    cb.checked = !!flipConfig[axis];
    cb.addEventListener("change", () => { flipConfig[axis] = cb.checked; saveFlipConfig(flipConfig); onFlipChange(); });
  });

  const scaleValueEl = panel.querySelector("#scale-value");
  function refreshScaleLabel(v){ scaleValueEl.textContent = v.toFixed(1) + "x"; }
  refreshScaleLabel(initialScale);
  panel.querySelector("#scale-down").addEventListener("click", () => {
    const v = Math.max(0.3, (parseFloat(scaleValueEl.textContent) || initialScale) - 0.2);
    refreshScaleLabel(v); onScaleChange(v);
  });
  panel.querySelector("#scale-up").addEventListener("click", () => {
    const v = Math.min(6, (parseFloat(scaleValueEl.textContent) || initialScale) + 0.2);
    refreshScaleLabel(v); onScaleChange(v);
  });

  return { btn, panel, refreshScaleLabel };
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
  let currentModelScale = loadModelScale();

  items.forEach(item => {
    const { group, hotspotMeshes } = buildItemVisual(item);
    group.scale.setScalar(currentModelScale);
    group.matrixAutoUpdate = false;
    group.visible = false;
    scene.add(group);
    groupsByMarkerId[Number(item.target_index)] = { group, item };
    lostCounters[item.item_id] = 0;
    wasVisible[item.item_id] = false;
    hotspotMeshes.forEach(h => allHotspotMeshes.push(h));
  });

  function applyModelScale(v){
    currentModelScale = Math.min(6, Math.max(0.3, v));
    Object.values(groupsByMarkerId).forEach(({ group }) => group.scale.setScalar(currentModelScale));
    saveModelScale(currentModelScale);
  }

  const flipConfig = loadFlipConfig();
  const debugPanel = buildDebugPanel(container, flipConfig, () => {}, currentModelScale, applyModelScale);

  // cubit-untuk-zoom (dua jari) - laras saiz model dalam AR secara langsung
  let pinchStartDist = null;
  let pinchStartScale = currentModelScale;
  function touchDistance(touches){
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }
  container.addEventListener("touchmove", (ev) => {
    if (ev.touches.length === 2){
      ev.preventDefault();
      const dist = touchDistance(ev.touches);
      if (pinchStartDist == null) { pinchStartDist = dist; pinchStartScale = currentModelScale; return; }
      applyModelScale(pinchStartScale * (dist / pinchStartDist));
      debugPanel.refreshScaleLabel(currentModelScale);
    }
  }, { passive: false });
  container.addEventListener("touchend", (ev) => { if (ev.touches.length < 2) pinchStartDist = null; });
  container.style.touchAction = "none";

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
