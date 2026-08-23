// ============================================================================
// API.JS - satu tempat untuk semua panggilan ke Google Apps Script backend.
// TUKAR API_URL selepas kamu deploy Apps Script (lihat README.md Langkah 3).
// ============================================================================

const API_URL = "https://script.google.com/macros/s/AKfycbz1IikJUXsv3NY8qLqNcI2w8ewzDQRA_X50ebGZlO63UU2chy4JHq_pKHIytCvtW0X-bg/exec";

const Api = {
  async get(action, params = {}) {
    const url = new URL(API_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Ralat tidak diketahui");
    return json.data;
  },

  // Nota: guna Content-Type text/plain dengan sengaja - elak Apps Script
  // menolak "preflight" CORS request yang berlaku bila guna application/json terus.
  async post(body) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Ralat tidak diketahui");
    return json;
  },

  getTopics() { return this.get("topics"); },
  getTopicBundle(topicId) { return this.get("topicBundle", { topic: topicId }); },
  getLeaderboard(topicId) { return this.get("leaderboard", topicId ? { topic: topicId } : {}); },
  adminList(sheet) { return this.get("adminList", { sheet }); },

  submitScore(payload) { return this.post({ action: "submitScore", payload }); },
  adminSave(passcode, sheet, payload) { return this.post({ action: "adminSave", passcode, sheet, payload }); },
  adminDelete(passcode, sheet, id) { return this.post({ action: "adminDelete", passcode, sheet, id }); },
  resetScores(passcode, topic) { return this.post({ action: "resetScores", passcode, topic }); }
};

function apiConfigured() {
  return API_URL && !API_URL.includes("PASTE_");
}

// Api ialah 'const', jadi ia TIDAK automatik jadi window.Api (tak macam
// function declaration). Skrip module (cth: alat letak hotspot admin, yang
// perlu Three.js) tak boleh capai 'const' skrip klasik terus - jadi kita
// dedahkan secara eksplisit di sini supaya kedua-dua jenis skrip boleh guna.
window.Api = Api;
