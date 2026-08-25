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
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

window.THREE = THREE;       // models.js (script biasa) guna THREE global ini
window.GLTFLoader = GLTFLoader; // models.js guna ini untuk load fail .glb sebenar

// Asas laluan TETAP untuk fail .glb, dikira dari lokasi ar-core.js sendiri
// (import.meta.url) - bukan dari halaman yang membukanya. Ini bermakna path
// dalam registerGLBModel(...) SENTIASA relatif kepada folder shared/, tak
// kira sama ada dibuka dari student/ atau admin/ - elak keliru "../shared/"
// yang senang tersalah/tertinggal (isu yang berlaku sebelum ini).
window.SHARED_BASE_URL = new URL("../", import.meta.url).href;

// Satu "unit" saiz penanda = 1 unit skala Three.js (bukan mm sebenar) -
// ini elak keperluan ukur kad sebenar. MODEL_SCALE ialah default awal sahaja -
// boleh dilaraskan LIVE guna slider dalam panel "Debug AR" (cubit skrin pun
// boleh - lihat pinch-to-zoom di bawah), nilai tersimpan automatik.
const MARKER_UNIT_SIZE = 1;
const DEFAULT_MODEL_SCALE = 2.2;
const LOST_GRACE_FRAMES = 5; // toleransi bingkai hilang sebelum model disorokkan (elak kelipan)

// Penukaran paksi pose (posit -> Three.js) kini betul secara matematik dan
// TAK PERLU dilaraskan manual (lihat poseToQuatPos di bawah). Yang mungkin
// perlu dilaraskan cuma "arah model" (facing180) - satu toggle mudah dalam
// panel "Debug AR" kalau model authored menghadap arah bertentangan.
function loadFacing180(){
  return localStorage.getItem("arFacing180") === "1";
}
function saveFacing180(v){
  localStorage.setItem("arFacing180", v ? "1" : "0");
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

// hotspot marker bersaiz BERKADAR dengan saiz model (modelRadius) - dahulu
// saiz tetap (0.045 unit) tak kira besar/kecil model, jadi nampak gergasi
// pada model kecil (cth pemegang elektrod) dan mikroskopik pada model besar.
export function attachHotspots(group, hotspots, modelRadius){
  const r = modelRadius || 0.3;
  const markerRadius = Math.max(r * 0.05, 0.008);
  const meshes = [];
  hotspots.forEach((hs, i) => {
    let x = Number(hs.pos_x) || 0, y = Number(hs.pos_y) || 0, z = Number(hs.pos_z) || 0;
    if (x === 0 && y === 0 && z === 0) {
      const angle = (i / Math.max(hotspots.length, 1)) * Math.PI * 2;
      x = Math.cos(angle) * r * 0.5;
      y = r * 0.2 + (i % 2) * r * 0.2;
      z = Math.sin(angle) * r * 0.5;
    }
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(markerRadius, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a })
    );
    marker.position.set(x, y, z);
    marker.userData.isHotspot = true;
    group.add(marker);
    meshes.push({ mesh: marker, label: hs.label, info: hs.info_text });
  });
  return meshes;
}

function getBoundingRadius(group){
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  return Math.max(size.length() * 0.5, 0.05);
}

// Bina model (placeholder ATAU .glb) dan terapkan skala tambahan dari Sheet
// "Items" (lajur model_scale, boleh dilaraskan admin guna slider dalam Alat
// Letak Hotspot - tak perlu edit kod untuk ubah saiz lagi). baseScale
// dipulangkan berasingan supaya slider admin boleh kira semula tanpa
// bertindih dengan skala kod asal (dari registerGLBModel).
async function buildScaledGroup(item){
  let group;
  try {
    group = await buildModelByRef(THREE, item.model_ref); // dari models.js (global)
  } catch (err) {
    // PENTING: sebelum ni, kalau .glb gagal dimuat (cth path salah), ralat
    // ini terus 'pecahkan' seluruh proses secara senyap - skrin jadi kosong
    // tanpa sebarang petunjuk kenapa. Sekarang, jatuh balik ke kotak
    // generik (wireframe oren) supaya kamu tahu ADA masalah, dan mesej
    // ralat sebenar tetap dicatat dalam console (F12 di PC, atau
    // chrome://inspect dari PC bersambung ke telefon) untuk debug lanjut.
    console.error(`Gagal muat model untuk model_ref "${item.model_ref}":`, err);
    group = buildGeneric(THREE);
  }
  const baseScale = group.scale.x || 1;
  const itemScale = Number(item.model_scale);
  if (!isNaN(itemScale) && itemScale > 0) group.scale.setScalar(baseScale * itemScale);
  return { group, baseScale };
}

export async function buildItemVisual(item){
  const { group } = await buildScaledGroup(item);
  const modelRadius = getBoundingRadius(group);
  const hotspotMeshes = attachHotspots(group, item.hotspots || [], modelRadius);
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // penting: JANGAN auto-putar model semasa/sejurus selepas pengguna
  // sedang drag - kalau tidak, putaran automatik "melawan" input pengguna
  // setiap frame dan rasa macam langsung tak responsive.
  let userInteracting = false;
  let idleResumeAt = 0;
  const clock = new THREE.Clock();
  controls.addEventListener("start", () => { userInteracting = true; });
  controls.addEventListener("end", () => { userInteracting = false; idleResumeAt = clock.getElapsedTime() + 1.2; });

  // model dimuatkan secara ASYNC (perlu untuk fail .glb sebenar, yang ambil
  // masa beberapa saat) - viewer & kawalan sedia terus, model muncul bila siap.
  let group = null;
  let hotspotMeshes = [];
  let stopped = false;

  (async () => {
    const built = await buildItemVisual(item);
    if (stopped) return; // pengguna dah tutup viewer sebelum model siap dimuat
    group = built.group;
    hotspotMeshes = built.hotspotMeshes;
    scene.add(group);

    // auto-fit kamera ikut saiz & pusat SEBENAR model (bukan andaikan model
    // sentiasa di (0,0,0) - model placeholder/glb kerap ada offset dalaman)
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.2);
    camera.position.set(center.x, center.y + radius * 0.3, center.z + radius * 2.4);
    controls.target.copy(center);
    controls.minDistance = radius * 0.8;
    controls.maxDistance = radius * 8;
    controls.update();
  })();

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

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    const dt = clock.getDelta();
    if (group) {
      if (group.userData.idleSpin && !userInteracting && t > idleResumeAt) {
        group.rotation.y += group.userData.idleSpin * dt;
      }
      if (group.userData.flicker) group.userData.flicker.intensity = 1.1 + Math.sin(t*30)*0.15 + (Math.random()-0.5)*0.2;
      if (group.userData.mixer) group.userData.mixer.update(dt); // animasi .glb dari Blender (kalau ada)
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    stop(){
      stopped = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onPointerDown);
      renderer.domElement.removeEventListener("touchend", onPointerDown);
      container.innerHTML = "";
    }
  };
}

// ==================== ADMIN: alat letak hotspot (klik terus pada model) ====
// Dipakai oleh admin/index.html sahaja - papar model dalam kotak kecil
// terbenam (bukan skrin penuh), model STATIK (tiada idle-spin, supaya senang
// nak klik tepat), papar penanda hotspot sedia ada (hijau) + satu penanda
// "belum simpan" (kuning) bila admin klik permukaan model baru.
export function startHotspotEditor(container, item, hotspots, { onSurfaceClick, onMarkerClick } = {}){
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
  addLights(scene);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  let group = null;
  let baseScale = 1;
  let modelRadius = 0.3;
  let stopped = false;

  function clearMarkers(){
    if (!group) return;
    group.children.filter(c => c.userData.isHotspotMarker || c.userData.isPendingMarker)
      .forEach(c => group.remove(c));
  }

  function renderHotspotMarkers(list){
    if (!group) return;
    clearMarkers();
    const markerRadius = Math.max(modelRadius * 0.05, 0.008);
    list.forEach(hs => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(markerRadius, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x3ecf8e })
      );
      marker.position.set(Number(hs.pos_x) || 0, Number(hs.pos_y) || 0, Number(hs.pos_z) || 0);
      marker.userData.isHotspotMarker = true;
      marker.userData.hotspot = hs;
      group.add(marker);
    });
  }

  function fitCameraToModel(){
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    modelRadius = Math.max(size.length() * 0.5, 0.05);
    camera.position.set(center.x, center.y + modelRadius * 0.3, center.z + modelRadius * 2.4);
    controls.target.copy(center);
    controls.minDistance = modelRadius * 0.5;
    controls.maxDistance = modelRadius * 10;
    controls.update();
  }

  (async () => {
    const built = await buildScaledGroup(item);
    if (stopped) return;
    group = built.group;
    baseScale = built.baseScale;
    scene.add(group);
    fitCameraToModel();
    renderHotspotMarkers(hotspots);
  })();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function onClick(ev){
    if (!group) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(group, true);
    if (!hits.length) return;
    const hit = hits[0];
    if (hit.object.userData.isHotspotMarker) {
      onMarkerClick && onMarkerClick(hit.object.userData.hotspot);
    } else if (!hit.object.userData.isPendingMarker) {
      // titik dalam ruang TEMPATAN model (local space) - inilah yang jadi
      // pos_x/pos_y/pos_z dalam Sheet, konsisten dengan macam mana hotspot
      // sedia ada diletak sebagai anak group (attachHotspots).
      const localPoint = group.worldToLocal(hit.point.clone());
      onSurfaceClick && onSurfaceClick(localPoint);
    }
  }
  renderer.domElement.addEventListener("click", onClick);

  function onResize(){
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener("resize", onResize);

  const hsEditorClock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (group && group.userData.mixer) group.userData.mixer.update(hsEditorClock.getDelta());
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setPendingMarker(pos){
      if (!group) return;
      let marker = group.children.find(c => c.userData.isPendingMarker);
      if (!marker) {
        const markerRadius = Math.max(modelRadius * 0.06, 0.01);
        marker = new THREE.Mesh(
          new THREE.SphereGeometry(markerRadius, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xffcc00 })
        );
        marker.userData.isPendingMarker = true;
        group.add(marker);
      }
      marker.position.copy(pos);
    },
    clearPendingMarker(){
      if (!group) return;
      const marker = group.children.find(c => c.userData.isPendingMarker);
      if (marker) group.remove(marker);
    },
    refreshHotspots(list){ renderHotspotMarkers(list); },
    // dipanggil oleh slider "Skala Model" dalam admin - laras saiz model
    // SECARA LANGSUNG dalam pratonton (tak simpan - admin perlu tekan
    // Simpan Skala secara berasingan untuk tulis ke Sheet).
    setScaleMultiplier(mult){
      if (!group || isNaN(mult) || mult <= 0) return;
      group.scale.setScalar(baseScale * mult);
      fitCameraToModel();
      renderHotspotMarkers(hotspots); // saiz penanda perlu kira semula ikut saiz baru
    },
    stop(){
      stopped = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);
      container.innerHTML = "";
    }
  };
}

// ==================== AR MODE (kamera + pengesanan ArUco) =================
// Tukar pose dari js-aruco2/posit (konvensyen kamera: Z positif = masuk ke
// dalam skrin) kepada Three.js (Z negatif = masuk ke dalam skrin). X & Y
// dah diselaraskan awal lagi semasa proses corners (lihat pemprosesan
// corners dalam gelung frame()).
//
// NOTA TEKNIKAL (kenapa versi lama rosak): tukar paksi Z dengan betul
// memerlukan "conjugation" F*R*F (bukan sekadar darab terus dengan -1 pada
// satu baris/lajur) - kalau tidak, hasilnya jadi CERMINAN (mirror), bukan
// putaran sebenar. Cerminan nampak "OK" pada sudut tertentu tapi jadi pelik
// (perlu 180° untuk hadap kamera, tapi 180° itu pula terbalikkan model) -
// tepat macam yang dilaporkan semasa ujian. Versi di bawah betul secara
// matematik (F*R*F, F=diag(1,1,-1)) - tiada lagi checkbox flip diperlukan.
function poseToQuatPos(rotation, translation){
  const r00=rotation[0][0], r01=rotation[0][1], r02=rotation[0][2];
  const r10=rotation[1][0], r11=rotation[1][1], r12=rotation[1][2];
  const r20=rotation[2][0], r21=rotation[2][1], r22=rotation[2][2];
  const m = new THREE.Matrix4();
  m.set(
     r00,  r01, -r02, 0,
     r10,  r11, -r12, 0,
    -r20, -r21,  r22, 0,
     0,    0,    0,   1
  );
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const p = new THREE.Vector3(translation[0], translation[1], -translation[2]);
  return { q, p };
}

function buildDebugPanel(container, initialScale, onScaleChange, initialFacing180, onFacingChange){
  // diletak di kiri-atas, kawasan yang KOSONG semasa mod AR (item-picker
  // hanya papar dalam mod 3D, target-banner kuiz di tengah) - dan diberi
  // gaya paling menonjol (latar oren pejal) supaya mustahil terlepas pandang.
  const btn = document.createElement("button");
  btn.textContent = "⚙ LARAS AR";
  btn.style.cssText = "position:absolute;top:56px;left:14px;z-index:50;font-family:monospace;font-weight:600;font-size:13px;padding:10px 16px;background:#ff7a1a;color:#111;border:none;border-radius:24px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);";
  const panel = document.createElement("div");
  panel.style.cssText = "position:absolute;top:152px;left:14px;z-index:50;background:rgba(10,10,11,.97);border:2px solid #ff7a1a;border-radius:6px;padding:14px 16px;display:none;font-family:monospace;font-size:12px;color:#f2f1ee;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.6);";
  panel.innerHTML = `
    <div style="color:#ff7a1a;text-transform:uppercase;font-size:11px;letter-spacing:.08em;margin-bottom:10px;">Saiz Model</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <button id="scale-down" style="flex:0 0 auto;font-size:16px;width:32px;height:32px;background:#232326;color:#f2f1ee;border:1px solid #333;border-radius:4px;cursor:pointer;">−</button>
      <span id="scale-value" style="flex:1;text-align:center;">1.5x</span>
      <button id="scale-up" style="flex:0 0 auto;font-size:16px;width:32px;height:32px;background:#232326;color:#f2f1ee;border:1px solid #333;border-radius:4px;cursor:pointer;">+</button>
    </div>
    <p style="font-size:10px;color:#a8a8ac;margin:0 0 12px;">Atau cubit dua jari terus atas skrin (dua jari juga boleh seret untuk gerak model).</p>
    <div style="color:#ff7a1a;text-transform:uppercase;font-size:11px;letter-spacing:.08em;margin-bottom:8px;">Arah Model</div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><input type="checkbox" id="facing-180" style="width:16px;height:16px;"> Pusing 180° (model menghadap terbalik)</label>
    <p style="font-size:10px;color:#a8a8ac;margin:8px 0 0;line-height:1.5;">Toggle SEKALI kalau model sentiasa membelakangkan kamera secara konsisten.</p>
    <p style="font-size:10px;color:#a8a8ac;margin:10px 0 0;line-height:1.5;border-top:1px solid #333;padding-top:10px;">Seret SATU jari atas model = pusing bebas. Seret DUA jari = gerak (pan) model. Tekan butang <strong style="color:#3ecf8e;">🔓 IKUT KAD</strong> untuk kunci model diam (senang letak kad, lepas tangan).</p>
  `;
  container.appendChild(btn);
  container.appendChild(panel);
  btn.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });

  const facingCb = panel.querySelector("#facing-180");
  facingCb.checked = !!initialFacing180;
  facingCb.addEventListener("change", () => onFacingChange(facingCb.checked));

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

function buildLockButton(container, getLocked, setLocked){
  const btn = document.createElement("button");
  function render(){
    const on = getLocked();
    btn.textContent = on ? "🔒 TERKUNCI" : "🔓 IKUT KAD";
    btn.style.background = on ? "#3ecf8e" : "rgba(0,0,0,.6)";
    btn.style.color = on ? "#111" : "#f2f1ee";
    btn.style.borderColor = on ? "#3ecf8e" : "#333";
  }
  btn.style.cssText = "position:absolute;top:104px;left:14px;z-index:50;font-family:monospace;font-weight:600;font-size:12px;padding:9px 14px;border:1px solid #333;border-radius:24px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);";
  render();
  container.appendChild(btn);
  btn.addEventListener("click", () => { setLocked(!getLocked()); render(); });
  return btn;
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
  const smoothedQuat = {}; // item_id -> THREE.Quaternion (pose halus, dikemaskini setiap bingkai bila tak locked)
  const smoothedPos = {};  // item_id -> THREE.Vector3
  const SMOOTH_ALPHA = 0.35; // 0=beku sepenuhnya, 1=ikut mentah (bergegar). 0.35 = seimbang.
  let currentModelScale = loadModelScale();
  let locked = false;
  let facing180 = loadFacing180();

  // offset putaran manual (drag jari) + pan (seret dua jari) - dilapis ATAS
  // orientasi kad, jadi pelajar boleh laras model dengan jari tanpa perlu
  // gerak kad fizikal.
  const dragRotation = { yaw: 0, pitch: 0 };
  const panOffset = new THREE.Vector3(0, 0, 0);
  const scaleV = new THREE.Vector3();

  await Promise.all(items.map(async (item) => {
    const { group, hotspotMeshes } = await buildItemVisual(item);
    group.matrixAutoUpdate = false;
    group.visible = false;
    scene.add(group);
    groupsByMarkerId[Number(item.target_index)] = { group, item };
    lostCounters[item.item_id] = 0;
    wasVisible[item.item_id] = false;
    hotspotMeshes.forEach(h => allHotspotMeshes.push(h));
  }));

  // BUG DIBAIKI: dahulu group.scale ditetapkan tapi diabaikan terus sebab
  // group.matrix ditulis semula PENUH setiap bingkai (matrixAutoUpdate=false)
  // dari pose sahaja, tanpa skala. Sekarang skala dibina terus ke dalam
  // matrix setiap bingkai - lihat buildFinalMatrix().
  function applyModelScale(v){
    currentModelScale = Math.min(6, Math.max(0.3, v));
    saveModelScale(currentModelScale);
  }

  function buildFinalMatrix(quat, pos){
    const finalQuat = quat.clone().multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        dragRotation.pitch,
        dragRotation.yaw + (facing180 ? Math.PI : 0),
        0
      ))
    );
    scaleV.set(currentModelScale, currentModelScale, currentModelScale);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(pos.x + panOffset.x, pos.y + panOffset.y, pos.z + panOffset.z),
      finalQuat,
      scaleV
    );
  }

  const debugPanel = buildDebugPanel(container, currentModelScale, applyModelScale, facing180, (v) => {
    facing180 = v; saveFacing180(v);
  });
  const lockBtn = buildLockButton(container, () => locked, (v) => { locked = v; });

  // ============ isyarat sentuh: 1 jari=putar/ketik, 2 jari=cubit(zoom)+seret(pan) ============
  let pinchStartDist = null;
  let pinchStartScale = currentModelScale;
  let panStartMid = null;
  function touchDistance(touches){
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }
  function touchMidpoint(touches){
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
  }

  const raycastHit = makeRaycastHandler(camera, () => allHotspotMeshes, (hit) => {
    if (onHotspotClick) onHotspotClick(hit);
  });

  const DRAG_THRESHOLD = 10; // px - lebih kecil dari ni dikira "ketik", bukan "seret"
  const ROTATE_SENSITIVITY = 0.008;
  const PAN_SENSITIVITY = 0.003;
  let drag = null; // {startX, startY, lastX, lastY, moved}

  function dragStart(x, y){ drag = { startX: x, startY: y, lastX: x, lastY: y, moved: false }; }
  function dragMove(x, y){
    if (!drag) return;
    const dx = x - drag.lastX, dy = y - drag.lastY;
    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > DRAG_THRESHOLD) drag.moved = true;
    if (drag.moved) {
      dragRotation.yaw += dx * ROTATE_SENSITIVITY;
      dragRotation.pitch += dy * ROTATE_SENSITIVITY;
      drag.lastX = x; drag.lastY = y;
    }
  }
  function dragEnd(){
    if (drag && !drag.moved) raycastHit({ clientX: drag.lastX, clientY: drag.lastY }); // tak gerak = ketik (hotspot)
    drag = null;
  }

  container.addEventListener("touchstart", (ev) => {
    if (ev.touches.length === 1) dragStart(ev.touches[0].clientX, ev.touches[0].clientY);
  }, { passive: true });
  container.addEventListener("touchmove", (ev) => {
    if (ev.touches.length === 1) {
      dragMove(ev.touches[0].clientX, ev.touches[0].clientY);
    } else if (ev.touches.length === 2) {
      ev.preventDefault();
      drag = null; // batalkan putaran satu-jari bila jari kedua turun
      const dist = touchDistance(ev.touches);
      const mid = touchMidpoint(ev.touches);
      if (pinchStartDist == null) {
        pinchStartDist = dist; pinchStartScale = currentModelScale; panStartMid = mid;
        return;
      }
      applyModelScale(pinchStartScale * (dist / pinchStartDist));
      debugPanel.refreshScaleLabel(currentModelScale);
      panOffset.x += (mid.x - panStartMid.x) * PAN_SENSITIVITY;
      panOffset.y -= (mid.y - panStartMid.y) * PAN_SENSITIVITY;
      panStartMid = mid;
    }
  }, { passive: false });
  container.addEventListener("touchend", (ev) => {
    if (ev.touches.length === 0) { dragEnd(); pinchStartDist = null; panStartMid = null; }
  });

  // sokongan tetikus (untuk ujian di PC)
  let mouseDown = false;
  container.addEventListener("mousedown", (ev) => { mouseDown = true; dragStart(ev.clientX, ev.clientY); });
  container.addEventListener("mousemove", (ev) => { if (mouseDown) dragMove(ev.clientX, ev.clientY); });
  container.addEventListener("mouseup", () => { mouseDown = false; dragEnd(); });
  container.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    applyModelScale(currentModelScale - ev.deltaY * 0.0015);
    debugPanel.refreshScaleLabel(currentModelScale);
  }, { passive: false });

  container.style.touchAction = "none";

  function onResize(){
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  const animClock = new THREE.Clock();
  let running = true;
  function frame(){
    if (!running) return;
    const dt = animClock.getDelta();
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

      const { q: rawQ, p: rawP } = poseToQuatPos(pose.bestRotation, pose.bestTranslation);

      if (!smoothedQuat[entry.item.item_id]) {
        // bingkai pertama kad ini dikesan - guna terus (tiada apa nak smooth lagi)
        smoothedQuat[entry.item.item_id] = rawQ.clone();
        smoothedPos[entry.item.item_id] = rawP.clone();
      } else if (!locked) {
        // slerp/lerp ke arah pose baru - hilangkan gegaran bingkai-ke-bingkai
        // tanpa perlu "locked" untuk nampak stabil.
        smoothedQuat[entry.item.item_id].slerp(rawQ, SMOOTH_ALPHA);
        smoothedPos[entry.item.item_id].lerp(rawP, SMOOTH_ALPHA);
      }
      // bila locked: langkau slerp/lerp di atas, guna nilai smoothed SEDIA ADA
      // (kekal beku) - tapi found/lost & visibility di bawah tetap berjalan
      // seperti biasa supaya Mod Kuiz tetap tahu kad mana sedang dilihat.

      entry.group.matrix.copy(buildFinalMatrix(smoothedQuat[entry.item.item_id], smoothedPos[entry.item.item_id]));
      entry.group.visible = true;
      lostCounters[entry.item.item_id] = 0;
      if (!wasVisible[entry.item.item_id]) {
        wasVisible[entry.item.item_id] = true;
        onTargetFound && onTargetFound(entry.item);
      }
    });

    // items yang tak dikesan bingkai ini - beri toleransi sebelum sorok.
    // INI SENTIASA berjalan (tak lagi dilangkau bila locked) - Mod Kuiz
    // perlukan status found/lost yang benar-benar mengikut kamera langsung,
    // walaupun paparan visual model itu sendiri sedang dibekukan.
    Object.values(groupsByMarkerId).forEach(({ group, item }) => {
      if (seenIds.has(Number(item.target_index))) return;
      lostCounters[item.item_id] += 1;
      if (lostCounters[item.item_id] > LOST_GRACE_FRAMES && wasVisible[item.item_id]) {
        if (!locked) group.visible = false; // kalau locked, model kekal kelihatan walau kad hilang
        wasVisible[item.item_id] = false;
        onTargetLost && onTargetLost(item);
      }
    });

    // animasi .glb dari Blender (kalau ada) - dikemaskini utk SEMUA item,
    // bukan cuma yang sedang dilihat, supaya tak "tersentak" bila kad
    // hilang-jumpa semula.
    Object.values(groupsByMarkerId).forEach(({ group }) => {
      if (group.userData.mixer) group.userData.mixer.update(dt);
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
      container.innerHTML = "";
    }
  };
}
