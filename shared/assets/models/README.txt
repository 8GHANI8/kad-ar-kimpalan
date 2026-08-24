Letak fail .glb kamu di sini (contoh: mesin-smaw.glb).

Selepas upload, daftarkan dalam shared/js/models.js:
  registerGLBModel("model_ref_kamu", "assets/models/nama-fail.glb", 1);

Path SENTIASA relatif kepada folder shared/ ini - tak perlu "../" atau
"shared/" di depan, tak kira dibuka dari student/ atau admin/.
