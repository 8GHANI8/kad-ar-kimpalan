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
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

window.THREE = THREE;       // models.js (script biasa) guna THREE global ini
window.GLTFLoader = GLTFLoader; // models.js guna ini untuk load fail .glb sebenar

// DRACOLoader: perlu untuk buka fail .glb yang dieksport dari Blender dengan
// "Draco mesh compression" dihidupkan (elak ralat "No DRACOLoader instance
// provided"). Decoder dimuat dari CDN unpkg (fail .wasm - tak perlu host
// sendiri). Satu instance dikongsi untuk semua model_ref (models.js pasang
// ini pada setiap GLTFLoader baru melalui window.dracoLoader).
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
window.dracoLoader = dracoLoader;

// Asas laluan TETAP untuk fail .glb, dikira dari lokasi ar-core.js sendiri
// (import.meta.url) - bukan dari halaman yang membukanya. Ini bermakna path
// dalam registerGLBModel(...) SENTIASA relatif kepada folder shared/, tak
// kira sama ada dibuka dari student/ atau admin/ - elak keliru "../shared/"
// yang senang tersalah/tertinggal (isu yang berlaku sebelum ini).
window.SHARED_BASE_URL = new URL("../", import.meta.url).href;

// Sama macam SHARED_BASE_URL tapi SATU tingkat lagi ke atas - sampai ke akar
// repo (bukan folder shared/). Video AR (ar_video_url) disimpan dalam
// videos/ di akar repo (lihat README.txt dalamnya), BUKAN dalam shared/,
// jadi ia perlukan asas laluan yang berbeza drpd model .glb.
window.ROOT_BASE_URL = new URL("../../", import.meta.url).href;

// Satu "unit" saiz penanda = 1 unit skala Three.js (bukan mm sebenar) -
// ini elak keperluan ukur kad sebenar. MODEL_SCALE ialah default awal sahaja -
// boleh dilaraskan LIVE guna cubit skrin (pinch-to-zoom, lihat di bawah),
// nilai tersimpan automatik.
const MARKER_UNIT_SIZE = 1;
const DEFAULT_MODEL_SCALE = 2.2;
const LOST_GRACE_FRAMES = 5; // toleransi bingkai hilang sebelum model disorokkan (elak kelipan)
// Kelajuan putaran idle LALAI untuk model .glb sebenar (registerGLBModel
// dalam models.js TAK PERNAH tetapkan userData.idleSpin sendiri - hanya
// model placeholder kotak lama buat begitu) - tanpa nilai fallback ini,
// suis "Putaran Automatik" dalam tab Pencahayaan admin tak beri apa-apa
// kesan pada mana-mana model sebenar yang dah dimuatkan.
const DEFAULT_IDLE_SPIN = 0.15;

// Kedudukan MULA model di atas kad AR (sebelum sebarang putaran jari).
// Model authored asalnya menghadap/terbaring arah lain berbanding kad - jadi
// dua "offset tetap" disediakan supaya betul sebaik kad dikesan, tiada
// panel/suis diperlukan, cuma tukar nombor terus di sini:
//   BASE_YAW_STEPS   - putar keliling paksi TEGAK (macam piring giring) -
//                       tukar arah mana MODEL MENGHADAP (depan/kiri/belakang/kanan)
//   BASE_PITCH_STEPS - condong ke depan/belakang (macam angguk kepala) -
//                       tukar sama ada model BERDIRI atau TERBARING
// Kedua-dua dalam unit suku-pusingan: 0=0°, 1=90°, 2=180°, 3=-90°.
const BASE_YAW_STEPS = 0;
const BASE_PITCH_STEPS = 1; // 1 x 90°
function loadModelScale(){
  const saved = parseFloat(localStorage.getItem("arModelScale"));
  return isNaN(saved) ? DEFAULT_MODEL_SCALE : saved;
}
function saveModelScale(v){
  localStorage.setItem("arModelScale", String(v));
}

// ============================================================================
// PENCAHAYAAN (BOLEH LARAS): admin boleh laras kecerahan paparan 3D/AR untuk
// SEMUA pelajar sekali gus dari tab "Pencahayaan" (disimpan dalam Sheet
// "Settings", satu baris sahaja - settings_id "global"). learn.html/quiz.html
// tarik nilai ini sekali semasa boot() dan hantar sebagai {lighting} kepada
// start3DViewer/startARViewer. Kalau Sheet belum ada lajur/baris ini lagi
// (kit lama), DEFAULT_LIGHTING diguna - app tak pernah patah sebab tiada
// tetapan pencahayaan.
// ============================================================================
export const DEFAULT_LIGHTING = {
  ambient_intensity: 1.05,
  direct_intensity: 1.0,
  rim_intensity: 0.6,
  exposure: 1.0,
  bg_color: "#0c0d0f",
  autorotate: true
};

export function mergeLighting(overrides){
  const out = { ...DEFAULT_LIGHTING };
  if (!overrides) return out;
  ["ambient_intensity", "direct_intensity", "rim_intensity", "exposure"].forEach(k => {
    const v = Number(overrides[k]);
    if (!isNaN(v)) out[k] = v;
  });
  if (overrides.bg_color) out.bg_color = overrides.bg_color;
  if (overrides.autorotate !== undefined && overrides.autorotate !== "") {
    out.autorotate = !(overrides.autorotate === false || overrides.autorotate === "FALSE" || overrides.autorotate === "false" || overrides.autorotate === "0");
  }
  return out;
}

// Pulangkan RUJUKAN kepada ketiga-tiga lampu (bukan cuma tambah ke scene
// senyap-senyap macam dahulu) - supaya panel Pencahayaan admin boleh laras
// intensiti LIVE (setLighting()) tanpa perlu bina semula scene setiap kali
// slider gerak.
export function addLights(scene, lighting){
  const cfg = lighting || DEFAULT_LIGHTING;
  const amb = new THREE.AmbientLight(0xffffff, cfg.ambient_intensity);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, cfg.direct_intensity);
  dir.position.set(1, 2, 1.5);
  scene.add(dir);
  const rim = new THREE.DirectionalLight(0x88aaff, cfg.rim_intensity);
  rim.position.set(-1.5, 0.5, -1);
  scene.add(rim);
  return { ambient: amb, main: dir, rim };
}

// Terap exposure (tone mapping) pada renderer - lapisan pencahayaan KEDUA,
// berasingan dari intensiti lampu individu (sama macam gltf-viewer rujukan).
export function applyExposure(renderer, lighting){
  const cfg = lighting || DEFAULT_LIGHTING;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = Number(cfg.exposure) > 0 ? Number(cfg.exposure) : 1;
}

// hotspot marker bersaiz BERKADAR dengan saiz model (modelRadius) - dahulu
// saiz tetap (0.045 unit) tak kira besar/kecil model, jadi nampak gergasi
// pada model kecil (cth pemegang elektrod) dan mikroskopik pada model besar.
// Sub-item PILIHAN: bundle.items dari server boleh jadi POKOK (item induk
// dengan subItems[]). AR & Kuiz cuma faham senarai RATA "item yang boleh
// diimbas/dilihat terus" (setiap satu ada model_ref/target_index sendiri) -
// induk yang ADA subItems dianggap folder navigasi sahaja (tiada model
// sendiri), jadi digantikan dengan anak-anaknya; item TANPA subItems terus
// masuk apa adanya (macam sebelum ciri sub-item wujud - tiada perubahan).
export function flattenLeafItems(items){
  const out = [];
  (items || []).forEach(item => {
    if (item.subItems && item.subItems.length) {
      out.push(...item.subItems);
    } else {
      out.push(item);
    }
  });
  return out;
}

// ============================================================================
// MEDIA: Item/Sub-item boleh guna model_ref (3D) ATAU ar_video_url (video)
// ATAU tiada visual sama sekali (contoh: youtube_url sahaja). Fungsi ini
// dipanggil merata (learn.html, quiz.html, ar-core.js sendiri) sebagai SATU
// sumber kebenaran - elak logik "ada media apa" bersepah dalam banyak fail.
// ============================================================================
export function itemHasModel(item){ return !!(item && item.model_ref); }
export function itemHasVideo(item){ return !!(item && item.ar_video_url); }

function buildVideoPlaneGroup(item){
  const group = new THREE.Group();
  const video = document.createElement("video");
  // Selesaikan ar_video_url berbanding AKAR REPO (window.ROOT_BASE_URL), bukan
  // berbanding halaman semasa (student/ atau admin/) - sebelum ini video.src
  // diberi terus sebagai string relatif, jadi ia tersalah selesai kepada
  // "student/videos/..." bila dibuka dari student/learn.html, walhal fail
  // sebenar berada di "videos/..." pada akar repo. Ini punca ralat 404.
  video.src = window.ROOT_BASE_URL ? new URL(item.ar_video_url, window.ROOT_BASE_URL).href : item.ar_video_url;
  video.crossOrigin = "anonymous";
  video.loop = true;
  video.muted = true;      // wajib utk mobile - main sebenar dikawal oleh butang ▶ kita sendiri
  video.playsInline = true;
  video.preload = "metadata"; // JANGAN preload seluruh fail (elak banyak video dimuat serentak)

  const texture = new THREE.VideoTexture(video);
  if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });

  // Saiz lalai munasabah (nisbah 16:9) - BUKAN dari Sheet lagi (Bahagian I:
  // guna default dulu). model_scale sedia ada tetap boleh besar/kecilkan
  // plane ini sama macam model 3D, sebab ia diskala pada peringkat GROUP
  // (buildFinalMatrix), bukan di sini - jadi "video_scale" berfungsi PERCUMA
  // tanpa lajur Sheet baru.
  const planeWidth = 1.2;
  const planeHeight = planeWidth * (9 / 16);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
  group.add(plane);

  // Nisbah 16:9 di atas cuma ANDAIAN AWAL (sebelum video sempat dimuat).
  // Bila metadata video sebenar sampai, kita tahu videoWidth/videoHeight
  // sebenar (cth 9:16 utk potret) - laraskan plane.scale.y supaya bentuk
  // sepadan dgn video sebenar, bukan sentiasa dipaksa jadi landskap 16:9
  // (ini punca video potret nampak "gepeng"/stretched sebelum ini).
  video.addEventListener("loadedmetadata", () => {
    if (!video.videoWidth || !video.videoHeight) return;
    const actualAspect = video.videoWidth / video.videoHeight; // lebar/tinggi sebenar
    const desiredHeight = planeWidth / actualAspect;
    plane.scale.y = desiredHeight / planeHeight;
  }, { once: true });

  group.userData.isVideoPlane = true;
  group.userData.video = video;
  group.userData.videoTexture = texture;
  return group;
}

function disposeVideo(group){
  const v = group && group.userData && group.userData.video;
  if (!v) return;
  v.pause();
  v.removeAttribute("src");
  v.load(); // paksa browser lepaskan buffer video (Bahagian G: jangan simpan video tak guna dalam memori)
}

export function attachHotspots(group, hotspots, modelRadius, hotspotScaleMult){
  const r = modelRadius || 0.3;
  const hsMult = hotspotScaleMult || 1;
  const markerRadius = Math.max(r * 0.05 * hsMult, 0.008);
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
  let group;
  if (itemHasModel(item)) {
    const built = await buildScaledGroup(item); // GLB/placeholder + model_scale sudah terbina
    group = built.group;
  } else if (itemHasVideo(item)) {
    group = buildVideoPlaneGroup(item);
    const itemScale = Number(item.model_scale);
    if (!isNaN(itemScale) && itemScale > 0) group.scale.setScalar(itemScale);
  } else {
    // Tiada model_ref ATAU ar_video_url - cth item youtube_url sahaja.
    // Group KOSONG, sengaja tiada placeholder (Bahagian E: jangan cipta
    // placeholder 3D tak perlu utk kandungan berasaskan video/pautan luar).
    group = new THREE.Group();
    group.userData.isEmpty = true;
  }

  const modelRadius = getBoundingRadius(group);
  // Hotspot cuma bermakna utk model 3D (Bahagian 19 spesifikasi awal:
  // kandungan video tak perlukan hotspot).
  const hotspotScaleMult = Number(item.hotspot_scale) || 1;
  const hotspotMeshes = itemHasModel(item)
    ? attachHotspots(group, item.hotspots || [], modelRadius, hotspotScaleMult)
    : [];
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
// Butang ▶ PLAY / ⏸ PAUSE yang sama dipakai dalam Mod 3D dan Mod AR - main
// perlu ditekan pengguna (Bahagian H: jangan andaikan autoplay bunyi
// berfungsi di telefon). z-index (4) sengaja LEBIH RENDAH dari panel info/
// hotspot (.hotspot-panel, z-index:6 dalam style.css) - bila panel "Keterangan
// Item" terbuka, ia melitupi butang ini (bukan sebaliknya).
function attachVideoPlayButton(container, video, style){
  const btn = document.createElement("button");
  btn.textContent = "▶ PLAY";
  btn.style.cssText = style || "position:absolute;bottom:80px;left:50%;transform:translateX(-50%);z-index:4;font-family:monospace;font-weight:600;font-size:13px;padding:10px 18px;background:#ff7a1a;color:#111;border:none;border-radius:24px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);";
  container.appendChild(btn);
  btn.addEventListener("click", () => {
    if (video.paused) {
      // Buka bunyi di sini sahaja (bukan lebih awal) - klik butang ini ialah
      // "user gesture" yang browser perlukan sebelum benarkan main video
      // BERBUNYI. Cuba nyahmute lebih awal (cth semasa video dicipta) akan
      // disekat oleh dasar autoplay kebanyakan browser mobile.
      video.muted = false;
      video.play();
      btn.textContent = "⏸ PAUSE";
    }
    else { video.pause(); btn.textContent = "▶ PLAY"; }
  });
  return btn;
}

export function start3DViewer(container, item, { onHotspotClick, lighting } = {}){
  const lightingCfg = lighting || DEFAULT_LIGHTING;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  applyExposure(renderer, lightingCfg);
  // Warna latar tetapan admin - tulis terus pada KOTAK (bukan renderer, sebab
  // renderer sengaja "alpha:true"/telus supaya gradient CSS #stage boleh
  // kelihatan). Tulis di sini bermakna ia MENGATASI gradient CSS lalai.
  if (lightingCfg.bg_color) container.style.background = lightingCfg.bg_color;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // PENTING: guna saiz KOTAK SEBENAR (container), bukan window.innerWidth/
  // innerHeight. Fungsi ni asalnya dibina utk skrin penuh (student Learn),
  // di mana container = seluruh viewport jadi kedua-duanya sama. Bila
  // dipakai semula utk pratonton admin (kotak kecil terbenam), guna saiz
  // window punca kanvas jadi SEBESAR SELURUH SKRIN lalu terpotong oleh
  // sempadan kotak kecil - cuma sekelumit sudut kelihatan (bug dilaporkan
  // & dibaiki sebelum ini - jangan tulis balik ke window.innerWidth).
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none"; // penting: elak browser 'curi' gesture drag/pinch

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
  addLights(scene, lightingCfg);

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

    if (group.userData.isVideoPlane) attachVideoPlayButton(container, group.userData.video);
  })();

  const onPointerDown = makeRaycastHandler(camera, () => hotspotMeshes, (hit) => {
    if (onHotspotClick) onHotspotClick(hit);
  });
  renderer.domElement.addEventListener("click", onPointerDown);
  renderer.domElement.addEventListener("touchend", onPointerDown, { passive: true });

  function onResize(){
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener("resize", onResize);

  renderer.setAnimationLoop(() => {
    // PENTING: clock.getElapsedTime() SEBENARNYA panggil getDelta() secara
    // dalaman (untuk kemas kini jumlah masa terkumpul), jadi panggil KEDUA-
    // DUA getElapsedTime() DAN getDelta() dalam bingkai yang sama (macam
    // sebelum ini) buat panggilan getDelta() kedua ukur hampir 0 saat -
    // masa antara DUA BARIS KOD ini, bukan masa sebenar sejak bingkai lepas!
    // Ini punca SEBENAR animasi "beku" - mixer.update(dt) dipanggil setiap
    // bingkai macam sepatutnya, tapi dt yang diterima hampir sifar setiap
    // kali, jadi animasi maju secara hampir tak ketara walau ditonton
    // berminit-minit. Betulkan dengan panggil getDelta() SEKALI sahaja,
    // then baca .elapsedTime (sifat, bukan kaedah) utk masa terkumpul.
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    if (group) {
      if (lightingCfg.autorotate && !userInteracting && t > idleResumeAt) {
        group.rotation.y += (group.userData.idleSpin || DEFAULT_IDLE_SPIN) * dt;
      }
      if (group.userData.flicker) group.userData.flicker.intensity = 1.1 + Math.sin(t*30)*0.15 + (Math.random()-0.5)*0.2;
      if (group.userData.mixer) group.userData.mixer.update(dt); // animasi .glb dari Blender (kalau ada)
      // THREE.VideoTexture biasanya auto-kemaskini, tapi ini jaring
      // keselamatan murah tanpa risiko - pastikan tekstur sentiasa segar
      // semasa video sedang main.
      if (group.userData.videoTexture && group.userData.video && !group.userData.video.paused) {
        group.userData.videoTexture.needsUpdate = true;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    stop(){
      stopped = true;
      if (group) disposeVideo(group);
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
export function startHotspotEditor(container, item, hotspots, { onSurfaceClick, onMarkerClick, lighting } = {}){
  let lightingCfg = lighting || DEFAULT_LIGHTING;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  applyExposure(renderer, lightingCfg);
  if (lightingCfg.bg_color) container.style.background = lightingCfg.bg_color;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
  const lights = addLights(scene, lightingCfg);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  let group = null;
  let baseScale = 1;
  let modelRadius = 0.3;
  let hotspotScaleMult = 1;
  let stopped = false;

  function clearMarkers(){
    if (!group) return;
    group.children.filter(c => c.userData.isHotspotMarker || c.userData.isPendingMarker)
      .forEach(c => group.remove(c));
  }

  function renderHotspotMarkers(list){
    if (!group) return;
    clearMarkers();
    const markerRadius = Math.max(modelRadius * 0.05 * hotspotScaleMult, 0.008);
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
    if (!itemHasModel(item)) {
      // Item ini guna Video (ar_video_url), bukan Model 3D - hotspot tak
      // berkenaan (Bahagian 19 spesifikasi awal). Papar mesej jelas
      // dari terus tunjuk kotak generik yang mengelirukan.
      container.innerHTML = `<p style="color:#a8a8ac;font-size:12px;padding:20px;margin:0;">Item ini guna kandungan <strong style="color:#f2f1ee;">Video</strong>, bukan Model 3D — hotspot tidak berkenaan untuk jenis kandungan ini.</p>`;
      return;
    }
    const built = await buildScaledGroup(item);
    if (stopped) return;
    group = built.group;
    baseScale = built.baseScale;
    const savedHotspotScale = Number(item.hotspot_scale);
    if (!isNaN(savedHotspotScale) && savedHotspotScale > 0) hotspotScaleMult = savedHotspotScale;
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
        const markerRadius = Math.max(modelRadius * 0.06 * hotspotScaleMult, 0.01);
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
    // dipanggil oleh tab "Pencahayaan" admin - laras SEMUA parameter cahaya
    // LIVE dalam pratonton ini (slider -> kesan serta-merta, tak perlu
    // simpan/reload). Terima objek SEBAHAGIAN (cuma kunci yang berubah).
    setLighting(partial){
      lightingCfg = { ...lightingCfg, ...partial };
      lights.ambient.intensity = lightingCfg.ambient_intensity;
      lights.main.intensity = lightingCfg.direct_intensity;
      lights.rim.intensity = lightingCfg.rim_intensity;
      applyExposure(renderer, lightingCfg);
      if (lightingCfg.bg_color) container.style.background = lightingCfg.bg_color;
    },
    // dipanggil oleh slider "Skala Model" dalam admin - laras saiz model
    // SECARA LANGSUNG dalam pratonton (tak simpan - admin perlu tekan
    // Simpan Skala secara berasingan untuk tulis ke Sheet).
    //
    // BUG DIBAIKI: dahulu fungsi ini panggil fitCameraToModel() setiap kali
    // slider gerak - itu reposisi KAMERA mengikut nisbah TETAP kepada saiz
    // model (jarak = radius x 2.4 SENTIASA), jadi saiz model di SKRIN
    // kekal sama walau apa pun nilai slider (kamera diam-diam "menipu"
    // untuk sentiasa muatkan model penuh skrin). Sekarang kamera KEKAL
    // DIAM bila slider gerak - hanya had zoom (min/maxDistance) dikemas
    // kini supaya munasabah, TANPA alihkan kedudukan kamera sebenar. Ini
    // fitCameraToModel() penuh kekal untuk MUAT AWAL sahaja (sekali,
    // sebelum admin mula berinteraksi).
    setScaleMultiplier(mult){
      if (!group || isNaN(mult) || mult <= 0) return;
      group.scale.setScalar(baseScale * mult);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      modelRadius = Math.max(size.length() * 0.5, 0.05);
      controls.minDistance = modelRadius * 0.3;
      controls.maxDistance = modelRadius * 15;
      renderHotspotMarkers(hotspots); // saiz penanda perlu kira semula ikut saiz baru
    },
    // slider "Saiz Hotspot" - kawalan BERASINGAN daripada skala model.
    // Skala model = besar/kecil OBJEK. Saiz hotspot = besar/kecil TITIK
    // PENANDA sahaja, tak jejas model.
    setHotspotScaleMultiplier(mult){
      if (isNaN(mult) || mult <= 0) return;
      hotspotScaleMult = mult;
      renderHotspotMarkers(hotspots);
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

// "Kunci"/BEKU di sini bermaksud: model TERUS ikut kedudukan & putaran kad
// sebenar (sama macam lalai - TIDAK dibekukan diam di skrin), tapi putaran
// jari (seret satu jari) DIMATIKAN - satu-satunya cara putar model ialah
// putar kad secara fizikal. Cubit dua jari (zoom/skala) & seret dua jari
// (pan) kekal berfungsi dalam kedua-dua keadaan.
function buildLockButton(container, getLocked, setLocked){
  const btn = document.createElement("button");
  function render(){
    const on = getLocked();
    btn.textContent = on ? "🔒 BEKU (putar guna kad)" : "🔓 AUTO-IKUT KAD";
    btn.style.background = on ? "#3ecf8e" : "rgba(0,0,0,.6)";
    btn.style.color = on ? "#111" : "#f2f1ee";
    btn.style.borderColor = on ? "#3ecf8e" : "#333";
  }
  btn.style.cssText = "position:absolute;top:56px;left:14px;z-index:50;font-family:monospace;font-weight:600;font-size:12px;padding:10px 14px;border:1px solid #333;border-radius:24px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);";
  render();
  container.appendChild(btn);
  btn.addEventListener("click", () => { setLocked(!getLocked()); render(); });
  return btn;
}

// ============================================================================
// MARKER-ASSISTED OPTICAL FLOW
// ArUco establishes the pose. While ArUco is temporarily unreadable, OpenCV.js
// follows visual features from the physical card and estimates card motion.
// When ArUco returns, it remains the authoritative pose.
// ============================================================================
const FLOW_MIN_POINTS = 10;
const FLOW_TARGET_POINTS = 80;
const FLOW_MAX_LOST_FRAMES = 45; // roughly 1.5 s at 30 fps
const FLOW_REINIT_INTERVAL = 12;
const FLOW_PYRAMID_WIN = 21;
const FLOW_PYRAMID_LEVELS = 3;
const FLOW_RANSAC_REPROJ = 3.0;

function cvReady(){
  return typeof cv !== "undefined" && typeof cv.Mat === "function" &&
    typeof cv.calcOpticalFlowPyrLK === "function" &&
    typeof cv.findHomography === "function";
}

async function waitForOpenCV(timeoutMs=8000){
  if (cvReady()) return true;
  const start=performance.now();
  while (performance.now()-start < timeoutMs){
    await new Promise(r=>setTimeout(r,50));
    if (cvReady()) return true;
  }
  return false;
}

function imageToGrayMat(imageData){
  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

function makeFlowState(){
  return {
    active: false,
    lostFrames: 0,
    refPts: null,
    prevPts: null,
    prevGray: null,
    refMarkerCorners: null,
    lastH: null,
    framesSinceInit: 0
  };
}

function destroyFlowState(flow){
  if (!flow) return;
  flow.refPts?.delete();
  flow.prevPts?.delete();
  flow.prevGray?.delete();
  flow.lastH?.delete();
  flow.refPts = flow.prevPts = flow.prevGray = flow.lastH = null;
  flow.active = false;
  flow.lostFrames = 0;
  flow.framesSinceInit = 0;
}

function initFlowState(flow, gray, marker){
  if (!cvReady() || !gray) return false;
  destroyFlowState(flow);

  const corners = marker.corners.map(c => ({ x:c.x, y:c.y }));
  const mask = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(0));

  // Prefer the artwork around the marker, not the ArUco pattern itself.
  // We build a rectangular "ring" around the marker: outer area is searched
  // for features, while the marker interior is explicitly excluded.
  const cx=corners.reduce((a,c)=>a+c.x,0)/4;
  const cy=corners.reduce((a,c)=>a+c.y,0)/4;
  const outer=corners.map(c=>({x:cx+(c.x-cx)*2.0,y:cy+(c.y-cy)*2.0}));
  const outerPoly=cv.matFromArray(4,1,cv.CV_32SC2,
    outer.flatMap(c=>[Math.round(c.x),Math.round(c.y)]));
  const innerPoly=cv.matFromArray(4,1,cv.CV_32SC2,
    corners.flatMap(c=>[Math.round(c.x),Math.round(c.y)]));
  cv.fillConvexPoly(mask,outerPoly,new cv.Scalar(255));
  cv.fillConvexPoly(mask,innerPoly,new cv.Scalar(0));
  outerPoly.delete();
  innerPoly.delete();

  // Avoid using the marker's black/white pattern as our only features.
  // goodFeaturesToTrack searches the whole detected card area, so the artwork
  // around the ArUco marker supplies the points.
  const found = new cv.Mat();
  cv.goodFeaturesToTrack(gray, found, FLOW_TARGET_POINTS, 0.01, 7, mask, 7, false, 0.04);
  mask.delete();

  if (found.rows < FLOW_MIN_POINTS) {
    found.delete();
    return false;
  }

  flow.refPts = found.clone();
  flow.prevPts = found.clone();
  flow.prevGray = gray.clone();
  flow.refMarkerCorners = corners;
  flow.lastH = cv.Mat.eye(3, 3, cv.CV_64F);
  flow.active = true;
  flow.lostFrames = 0;
  flow.framesSinceInit = 0;
  found.delete();
  return true;
}

function transformPointsWithHomography(H, points){
  const src = cv.matFromArray(points.length, 1, cv.CV_32FC2,
    points.flatMap(p => [p.x, p.y]));
  const dst = new cv.Mat();
  cv.perspectiveTransform(src, dst, H);
  const out = [];
  for (let i=0; i<dst.rows; i++){
    out.push({x:dst.data32F[i*2], y:dst.data32F[i*2+1]});
  }
  src.delete();
  dst.delete();
  return out;
}

function flowStep(flow, gray){
  if (!cvReady() || !gray || !flow.active || !flow.prevGray ||
      !flow.prevPts || !flow.refPts) return null;

  const nextPts = new cv.Mat();
  const status = new cv.Mat();
  const err = new cv.Mat();
  const win = new cv.Size(FLOW_PYRAMID_WIN, FLOW_PYRAMID_WIN);

  cv.calcOpticalFlowPyrLK(
    flow.prevGray, gray, flow.prevPts, nextPts, status, err,
    win, FLOW_PYRAMID_LEVELS,
    new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 30, 0.01),
    0, 0.001
  );

  const refGood = [], curGood = [];
  for (let i=0; i<status.rows; i++){
    if (!status.data[i]) continue;
    const x=nextPts.data32F[i*2], y=nextPts.data32F[i*2+1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x<0 || y<0 || x>=gray.cols || y>=gray.rows) continue;
    refGood.push({x:flow.refPts.data32F[i*2], y:flow.refPts.data32F[i*2+1]});
    curGood.push({x,y});
  }
  status.delete(); err.delete();

  if (refGood.length < FLOW_MIN_POINTS){
    nextPts.delete();
    return {ok:false,count:refGood.length};
  }

  const refMat=cv.matFromArray(refGood.length,1,cv.CV_32FC2,refGood.flatMap(p=>[p.x,p.y]));
  const curMat=cv.matFromArray(curGood.length,1,cv.CV_32FC2,curGood.flatMap(p=>[p.x,p.y]));
  const inlierMask=new cv.Mat();
  const H=cv.findHomography(refMat,curMat,cv.RANSAC,FLOW_RANSAC_REPROJ,inlierMask);
  refMat.delete(); curMat.delete();

  if (H.empty()){
    H.delete(); inlierMask.delete(); nextPts.delete();
    return {ok:false,count:refGood.length};
  }

  let inliers=0;
  for (let i=0;i<inlierMask.rows;i++) if(inlierMask.data[i]) inliers++;
  inlierMask.delete();

  if (inliers<FLOW_MIN_POINTS){
    H.delete(); nextPts.delete();
    return {ok:false,count:inliers};
  }

  flow.prevPts.delete();
  flow.prevPts=nextPts;
  flow.prevGray.delete();
  flow.prevGray=gray.clone();
  if(flow.lastH) flow.lastH.delete();
  flow.lastH=H.clone();
  H.delete();
  flow.framesSinceInit++;

  return {
    ok:true,
    count:inliers,
    markerCorners:transformPointsWithHomography(flow.lastH,flow.refMarkerCorners)
  };
}

export async function startARViewer(container, topicId, items, {
  onTargetFound,   // (item) => void
  onTargetLost,    // (item) => void
  onHotspotClick,  // (hit) => void
  onError,         // (err) => void
  lighting         // tetapan Pencahayaan dari admin (Sheet "Settings")
} = {}){
  const lightingCfg = lighting || DEFAULT_LIGHTING;
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

  // OpenCV.js is loaded by learn.html/quiz.html. Wait briefly so optical-flow
  // tracking is ready before the first AR frame; if it is unavailable, fall
  // back automatically to the existing ArUco-only tracker.
  const opticalFlowAvailable = await waitForOpenCV(8000);
  if (!opticalFlowAvailable) {
    console.warn("OpenCV.js tidak siap; AR akan guna ArUco sahaja.");
  }

  const dw = video.videoWidth || 640, dh = video.videoHeight || 480;
  const detectionCanvas = document.createElement("canvas");
  detectionCanvas.width = dw; detectionCanvas.height = dh;
  const dctx = detectionCanvas.getContext("2d", { willReadFrequently: true });

  const glCanvas = document.createElement("canvas");
  glCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(glCanvas);

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
  applyExposure(renderer, lightingCfg);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const focalLength = dw; // andaian standard bila tiada kalibrasi kamera sebenar
  const vFov = 2 * Math.atan((dh/2) / focalLength) * (180/Math.PI);
  const camera = new THREE.PerspectiveCamera(vFov, dw/dh, 0.01, 100);

  const scene = new THREE.Scene();
  addLights(scene, lightingCfg);

  const detector = new AR.Detector({ dictionaryName: "ARUCO" });
  const posit = new POS.Posit(MARKER_UNIT_SIZE, dw);

  const groupsByMarkerId = {};
  const allHotspotMeshes = [];
  const lostCounters = {};
  const wasVisible = {};
  const smoothedQuat = {}; // item_id -> THREE.Quaternion (pose halus, dikemaskini setiap bingkai)
  const smoothedPos = {};  // item_id -> THREE.Vector3
  const flowStates = {};    // item_id -> marker-assisted optical-flow state
  const SMOOTH_ALPHA = 0.35; // 0=beku sepenuhnya, 1=ikut mentah (bergegar). 0.35 = seimbang.
  let currentModelScale = loadModelScale();
  let locked = false;

  // offset putaran manual (drag jari) + pan (seret dua jari) - dilapis ATAS
  // orientasi kad, jadi pelajar boleh laras model dengan jari tanpa perlu
  // gerak kad fizikal. DIMATIKAN (yaw/pitch dibeku pada 0) bila locked=true -
  // lihat buildLockButton() di bawah.
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
    flowStates[item.item_id] = makeFlowState();
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
        dragRotation.pitch + BASE_PITCH_STEPS * (Math.PI / 2),
        dragRotation.yaw + BASE_YAW_STEPS * (Math.PI / 2),
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

  const lockBtn = buildLockButton(container, () => locked, (v) => {
    locked = v;
    if (locked) { dragRotation.yaw = 0; dragRotation.pitch = 0; } // pulang ke kedudukan MULA bila dikunci
  });

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
      // bila locked, seretan SATU jari tak lagi putar model (putaran cuma
      // boleh datang dari kad fizikal) - tapi gerakan masih dijejak supaya
      // ketik hotspot (drag.moved=false) vs seret sengaja tetap dibezakan betul.
      if (!locked) {
        dragRotation.yaw += dx * ROTATE_SENSITIVITY;
        dragRotation.pitch += dy * ROTATE_SENSITIVITY;
      }
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
  }, { passive: false });

  container.style.touchAction = "none";

  function onResize(){
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  // ---- kawalan main/jeda video AR: SATU butang dikongsi, dipindah/paparkan
  // ikut kad video mana sedang aktif (elak banyak butang bertindih) ----
  let activeVideoItemId = null;
  let videoPlayBtn = null;
  function showVideoControls(item, videoEl){
    activeVideoItemId = item.item_id;
    if (!videoPlayBtn) {
      videoPlayBtn = attachVideoPlayButton(container, videoEl, "position:absolute;bottom:150px;left:50%;transform:translateX(-50%);z-index:4;font-family:monospace;font-weight:600;font-size:13px;padding:10px 18px;background:#ff7a1a;color:#111;border:none;border-radius:24px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);");
    } else {
      // butang sedia ada - tukar video yang dikawalnya kepada kad BARU
      // dikesan (buang & bina semula listener supaya tak terlekat pada
      // video lama)
      const fresh = videoPlayBtn.cloneNode(true);
      videoPlayBtn.replaceWith(fresh);
      videoPlayBtn = fresh;
      videoPlayBtn.textContent = "▶ PLAY";
      videoPlayBtn.addEventListener("click", () => {
        if (videoEl.paused) { videoEl.muted = false; videoEl.play(); videoPlayBtn.textContent = "⏸ PAUSE"; }
        else { videoEl.pause(); videoPlayBtn.textContent = "▶ PLAY"; }
      });
    }
    videoPlayBtn.style.display = "block";
  }
  function hideVideoControlsIfActive(item){
    if (activeVideoItemId === item.item_id) {
      activeVideoItemId = null;
      if (videoPlayBtn) videoPlayBtn.style.display = "none";
    }
  }

  const animClock = new THREE.Clock();
  let running = true;
  function frame(){
    if (!running) return;
    const dt = animClock.getDelta();
    dctx.drawImage(video, 0, 0, dw, dh);
    const imageData = dctx.getImageData(0, 0, dw, dh);
    const markers = detector.detect(imageData);
    const seenIds = new Set();

    // Optical-flow uses a grayscale copy of the same camera frame. It is
    // deliberately optional: if OpenCV.js is unavailable, the old ArUco-only
    // path below still works exactly as before.
    let grayFrame = null;
    if (opticalFlowAvailable && cvReady()) {
      try {
        grayFrame = imageToGrayMat(imageData);
      } catch (err) {
        console.warn("OpenCV frame conversion failed:", err);
      }
    }

    // 1) ArUco is the authoritative source whenever the marker is visible.
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
      const id = entry.item.item_id;
      const flow = flowStates[id];

      if (!smoothedQuat[id]) {
        // bingkai pertama kad ini dikesan - guna terus (tiada apa nak smooth lagi)
        smoothedQuat[id] = rawQ.clone();
        smoothedPos[id] = rawP.clone();
      } else {
        // Kekalkan smoothing asal ArUco.
        smoothedQuat[id].slerp(rawQ, SMOOTH_ALPHA);
        smoothedPos[id].lerp(rawP, SMOOTH_ALPHA);
      }

      entry.group.matrix.copy(buildFinalMatrix(smoothedQuat[id], smoothedPos[id]));
      entry.group.visible = true;
      lostCounters[id] = 0;

      // Seed/reseed visual tracking from a fresh ArUco frame. We re-seed
      // periodically while the marker is visible so the reference points stay
      // healthy, but ArUco remains the authority for actual pose.
      if (opticalFlowAvailable && cvReady() && grayFrame &&
          (!flow.active || flow.lostFrames > 0 || flow.framesSinceInit >= FLOW_REINIT_INTERVAL)) {
        try {
          initFlowState(flow, grayFrame, marker);
        } catch (err) {
          console.warn("Optical flow init failed:", err);
          destroyFlowState(flow);
        }
      }
      flow.lostFrames = 0;

      if (!wasVisible[id]) {
        wasVisible[id] = true;
        onTargetFound && onTargetFound(entry.item);
        if (entry.group.userData.isVideoPlane) showVideoControls(entry.item, entry.group.userData.video);
      }
    });

    // 2) ArUco is temporarily missing: follow the visual features on the card.
    // The tracker estimates a planar homography and moves the original marker
    // corners through that homography, then feeds those corners through the
    // same POSIT pose solver used by ArUco. This keeps the coordinate system
    // identical to the existing renderer.
    if (opticalFlowAvailable && cvReady() && grayFrame) {
      Object.values(groupsByMarkerId).forEach(({ group, item }) => {
        const id = item.item_id;
        const flow = flowStates[id];
        if (seenIds.has(Number(item.target_index)) || !flow.active || !wasVisible[id]) return;

        const result = flowStep(flow, grayFrame);
        if (result && result.ok) {
          flow.lostFrames = 0;
          const trackedCorners = result.markerCorners.map(c => ({
            x: c.x - dw/2,
            y: dh/2 - c.y
          }));
          const flowPose = posit.pose(trackedCorners);

          if (flowPose) {
            const { q, p } = poseToQuatPos(flowPose.bestRotation, flowPose.bestTranslation);
            // Lock still means freeze the model pose. Otherwise let the card
            // tracker update the same smoothed pose used by ArUco.
            if (!locked) {
              smoothedQuat[id].slerp(q, 0.22);
              smoothedPos[id].lerp(p, 0.22);
              group.matrix.copy(buildFinalMatrix(smoothedQuat[id], smoothedPos[id]));
            }
            group.visible = true;
            lostCounters[id] = 0;
            return;
          }
        }

        flow.lostFrames++;

        // A short tracking hiccup should not make the object disappear.
        if (flow.lostFrames <= FLOW_MAX_LOST_FRAMES) {
          group.visible = true;
          return;
        }

        if (wasVisible[id]) {
          group.visible = false;
          wasVisible[id] = false;
          destroyFlowState(flow);
          onTargetLost && onTargetLost(item);
          if (group.userData.isVideoPlane && group.userData.video) {
            group.userData.video.pause();
            hideVideoControlsIfActive(item);
          }
        }
      });
    } else {
      // No OpenCV: preserve the original ArUco-only lost-frame behavior.
      Object.values(groupsByMarkerId).forEach(({ group, item }) => {
        if (seenIds.has(Number(item.target_index))) return;
        lostCounters[item.item_id] += 1;
        if (lostCounters[item.item_id] > LOST_GRACE_FRAMES && wasVisible[item.item_id]) {
          group.visible = false;
          wasVisible[item.item_id] = false;
          onTargetLost && onTargetLost(item);
          if (group.userData.isVideoPlane && group.userData.video) {
            group.userData.video.pause();
            hideVideoControlsIfActive(item);
          }
        }
      });
    }

    if (grayFrame) grayFrame.delete();

    // animasi .glb dari Blender (kalau ada, utk SEMUA item supaya tak
    // "tersentak" bila kad hilang-jumpa semula) + segar tekstur video yang
    // sedang main & kelihatan - satu laluan sahaja.
    Object.values(groupsByMarkerId).forEach(({ group }) => {
      if (group.userData.mixer) group.userData.mixer.update(dt);
      if (group.userData.videoTexture && group.userData.video && group.visible && !group.userData.video.paused) {
        group.userData.videoTexture.needsUpdate = true;
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
      Object.values(groupsByMarkerId).forEach(({ group }) => disposeVideo(group));
      window.removeEventListener("resize", onResize);
      container.innerHTML = "";
    }
  };
}
