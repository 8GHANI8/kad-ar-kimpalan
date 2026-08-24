// ============================================================================
// MODELS.JS
// Setiap fungsi di sini pulangkan hanya THREE.Group (bentuk 3D).
// Hotspot TIDAK dibina di sini lagi - ia datang dari Google Sheet (Hotspots tab)
// dan dilekat automatik oleh app.js guna pos_x/pos_y/pos_z. Ini bermakna bila
// kamu ganti model placeholder dengan .glb sebenar, kamu HANYA tukar fungsi
// builder - hotspot terus berfungsi sebab ia datang dari data, bukan kod.
//
// model_ref dalam sheet "Items" mesti sama dengan nama fungsi di bawah.
// Kalau model_ref tak jumpa, buildGeneric() akan diguna sebagai gantian
// supaya app tak crash - jadi kamu boleh isi Sheet dulu sebelum semua model
// siap dibina.
// ============================================================================

const MODEL_BUILDERS = {};

function registerModel(name, fn) {
  MODEL_BUILDERS[name] = fn;
}

function buildModelByRef(THREE, ref) {
  const fn = MODEL_BUILDERS[ref];
  if (typeof fn === "function") return fn(THREE);
  return buildGeneric(THREE);
}

// ---------------------------------------------------------------- generic --
function buildGeneric(THREE) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x555559, roughness: 0.6, metalness: 0.3 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat);
  group.add(box);
  const wire = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.42),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, wireframe: true })
  );
  group.add(wire);
  group.userData.idleSpin = 0.2;
  return group;
}
registerModel("buildGeneric", buildGeneric);

// ------------------------------------------------------------- SMAW parts --
registerModel("buildSMAWMachine", (THREE) => {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x52555c, roughness: 0.6, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.2 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.45), metal);
  group.add(box);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), accent);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.2, 0.1, 0.24);
  group.add(dial);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3b40 }));
  vent.position.set(-0.05, 0.2, 0);
  group.add(vent);

  group.userData.idleSpin = 0.15;
  return group;
});

registerModel("buildElectrodeHolder", (THREE) => {
  const group = new THREE.Group();
  const rubber = new THREE.MeshStandardMaterial({ color: 0x35363a, roughness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.2 });
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xcfcfd2, roughness: 0.3, metalness: 0.6 });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.32, 16), rubber);
  handle.rotation.z = Math.PI / 2.3;
  group.add(handle);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 16), accent);
  jaw.rotation.z = Math.PI / 2.3;
  jaw.position.set(0.17, 0.1, 0);
  group.add(jaw);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 10), rodMat);
  rod.rotation.z = Math.PI / 2.3;
  rod.position.set(0.34, 0.155, 0);
  group.add(rod);

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: 0xeaf6ff }));
  glow.position.set(0.44, 0.19, 0);
  group.add(glow);
  const light = new THREE.PointLight(0xfff0d0, 1.2, 1);
  light.position.copy(glow.position);
  group.add(light);

  group.userData.idleSpin = 0.15;
  group.userData.flicker = light;
  return group;
});

registerModel("buildGroundClamp", (THREE) => {
  const group = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x35363a, roughness: 0.9 });

  const jawTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), accent);
  jawTop.position.set(0, 0.05, 0);
  jawTop.rotation.z = -0.15;
  group.add(jawTop);
  const jawBottom = jawTop.clone();
  jawBottom.position.y = -0.05;
  jawBottom.rotation.z = 0.15;
  group.add(jawBottom);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12), rubber);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.22, 0, 0);
  group.add(handle);

  group.userData.idleSpin = 0.18;
  return group;
});

// -------------------------------------------------------------------- PPE --
registerModel("buildHelmet", (THREE) => {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x3c3e43, roughness: 0.5, metalness: 0.2 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x1d4a56, roughness: 0.2, metalness: 0.6 });
  const warn = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), shell);
  group.add(dome);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.03), visor);
  plate.position.set(0, -0.06, 0.24);
  group.add(plate);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.04), warn);
  stripe.position.set(0, 0.16, 0.2);
  group.add(stripe);

  group.userData.idleSpin = 0.12;
  return group;
});

// ------------------------------------------------------------------ joints -
registerModel("buildButtJoint", (THREE) => {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d93, roughness: 0.55, metalness: 0.5 });
  const bead = new THREE.MeshStandardMaterial({ color: 0x4fc3f7, roughness: 0.5, metalness: 0.3 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.4), steel);
  a.position.set(-0.17, 0, 0);
  group.add(a);
  const b = a.clone();
  b.position.x = 0.17;
  group.add(b);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 10), bead);
  w.rotation.z = Math.PI / 2; w.rotation.y = Math.PI / 2;
  w.position.set(0, 0.045, 0);
  group.add(w);
  group.userData.idleSpin = 0.14;
  return group;
});

registerModel("buildFilletJoint", (THREE) => {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d93, roughness: 0.55, metalness: 0.5 });
  const bead = new THREE.MeshStandardMaterial({ color: 0x4fc3f7, roughness: 0.5, metalness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.32), steel);
  group.add(base);
  const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.32), steel);
  upright.position.set(0, 0.16, 0);
  group.add(upright);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 10), bead);
  w.rotation.z = Math.PI / 2;
  w.position.set(0.03, 0.025, 0);
  group.add(w);
  group.userData.idleSpin = 0.14;
  return group;
});

// ============================================================================
// GUNA MODEL .GLB SEBENAR (dari scan Reality Scan / Kiri Engine / Blender)
// Panggil fungsi ni untuk daftarkan satu model .glb sebenar - tak perlu
// faham async/GLTFLoader, cuma isi 3 nilai. Contoh:
//
//   registerGLBModel("buildSMAWMachine", "assets/models/mesin-smaw.glb", 0.4);
//
// - Nama PERTAMA mesti SAMA PERSIS dengan model_ref item itu dalam Sheet "Items".
// - Path KEDUA SENTIASA relatif kepada folder shared/ (bukan kepada halaman
//   yang dibuka, dan bukan kepada models.js sendiri) - jadi letak fail .glb
//   dalam shared/assets/models/, dan cuma tulis
//   "assets/models/nama-fail.glb" (TANPA "../", tanpa "shared/" di depan).
//   Ini SENTIASA betul tak kira sama ada dibuka dari student/ atau admin/.
// - Nombor KETIGA (scale) melaraskan saiz keseluruhan model - mula dengan 1,
//   kecilkan (cth 0.05-0.5) kalau model nampak gergasi, besarkan kalau
//   terlalu kecil berbanding model placeholder lain. Simpan, reload, lihat,
//   ulang sehingga nampak elok berbanding kad AR (rujuk README.md Langkah 8).
//
// ANIMASI: kalau fail .glb ada animasi dibuat/di-bake dalam Blender (Action
// pada objek, export dengan "Include > Animation" dihidupkan semasa eksport
// .glb dari Blender), SEMUA animasi dalam fail akan dimainkan secara automatik
// & berulang (loop) - tak perlu buat apa-apa lagi, cuma pastikan animasi
// tersimpan dalam fail .glb itu sendiri.
//
// Untuk GANTI model placeholder sedia ada (contoh buildSMAWMachine), letak
// baris registerGLBModel(...) SELEPAS baris registerModel("buildSMAWMachine"...)
// yang asal - versi terakhir menang (overwrite versi sebelumnya secara automatik).
// ============================================================================
function registerGLBModel(name, path, scale){
  registerModel(name, async (THREE) => {
    const loader = new window.GLTFLoader();
    // path sentiasa diselesaikan berbanding folder shared/ (lihat
    // window.SHARED_BASE_URL dalam ar-core.js) - bukan berbanding halaman
    // semasa - supaya "assets/models/fail.glb" SENTIASA betul, tak kira
    // dibuka dari student/ atau admin/.
    const resolvedUrl = window.SHARED_BASE_URL ? new URL(path, window.SHARED_BASE_URL).href : path;
    const gltf = await loader.loadAsync(resolvedUrl);
    const group = gltf.scene;
    group.scale.setScalar(scale !== undefined ? scale : 1);

    if (gltf.animations && gltf.animations.length){
      const mixer = new THREE.AnimationMixer(group);
      gltf.animations.forEach(clip => mixer.clipAction(clip).play());
      // disimpan dalam userData supaya viewer (ar-core.js) boleh panggil
      // mixer.update(dt) setiap bingkai - tanpa ini animasi tersimpan
      // dalam fail tapi TAK akan bergerak dalam app.
      group.userData.mixer = mixer;
    }
    return group;
  });
}

// Contoh (padam "//" di depan bila kamu betul-betul ada fail .glb untuk item ini):
// registerGLBModel("buildSMAWMachine", "assets/models/mesin-smaw.glb", 0.4);
registerGLBModel("buildSMAWMachine", "assets/models/pemegang-elektrod.glb", 0.4);

