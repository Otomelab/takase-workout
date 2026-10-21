import { GeminiCoach, GEMINI_MODELS, GEMINI_VOICES } from "./gemini.js";
import { pickPraise, FACE_FOR } from "./praise.js";

const $ = (id) => document.getElementById(id);
const FACES = { neutral: "img/neutral.png", smile: "img/smile.png", surprise: "img/surprise.png", shy: "img/shy.png", worried: "img/worried.png", fun: "img/fun.png" };
Object.values(FACES).forEach((src) => { const i = new Image(); i.src = src; });
const EX = {
  squat: { name: "スクワット", unit: "回", form: ["膝とつま先、同じ向きで", "お尻を後ろに引いて", "背中まっすぐ、胸張って"] },
  pushup: { name: "腕立て", unit: "回", form: ["体は一直線っす", "胸から床に近づけて", "肘、開きすぎないで"] },
  situp: { name: "腹筋", unit: "回", form: ["おへそを覗き込む感じで", "反動は使わずに", "息吐きながら上がる"] },
  plank: { name: "プランク", unit: "秒", form: ["お尻、上がりすぎてないっすよ", "お腹に力入れて", "呼吸は止めない"] },
};
const LS = { hist: "slot036.history", set: "slot036.settings", gkey: "slot036.geminiKey" };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 数え方（いーち、にー…） ---
const ONES = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
const LONG = ["", "いーち", "にー", "さーん", "しー", "ごー", "ろーく", "なーな", "はーち", "きゅー", "じゅう"];
function countWord(n) {
  if (n <= 10) return LONG[n];
  if (n >= 100) return String(n);
  const t = Math.floor(n / 10), o = n % 10;
  return (t === 1 ? "" : ONES[t]) + "じゅう" + ONES[o];
}

// --- 表情とアニメ ---
const face = $("face");
function show(expr, anim = "bounce") {
  face.src = FACES[expr] || FACES.smile;
  face.classList.remove("bounce", "cheer"); void face.offsetWidth; face.classList.add(anim);
}
function bubble(t) { $("bubble").textContent = t; }

// --- 読み上げ（Web Speech API） ---
let jaVoices = [];
function loadVoices() {
  jaVoices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("ja"));
  const sel = $("ttsVoice"), cur = settings.ttsVoice;
  sel.innerHTML = jaVoices.map((v) => `<option value="${v.name}">${v.name}</option>`).join("") || "<option value=''>（日本語の声が見つからへん）</option>";
  if (cur) sel.value = cur;
}
function speak(text, { rate = 1.1, pitch = 0.9 } = {}) {
  if (!$("voiceOn").checked || !("speechSynthesis" in window) || gemini.connected) return Promise.resolve();
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = rate; u.pitch = pitch;
    const v = jaVoices.find((x) => x.name === $("ttsVoice").value); if (v) u.voice = v;
    u.onend = u.onerror = () => res();
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    setTimeout(res, 6000);
  });
}

// --- 設定 ---
const settings = JSON.parse(localStorage.getItem(LS.set) || "{}");
for (const id of ["exercise", "reps", "sets", "rest", "tempo", "nickname"]) if (settings[id] != null) $(id).value = settings[id];
if (settings.voiceOn === false) $("voiceOn").checked = false;
$("gmodel").innerHTML = GEMINI_MODELS.map((m) => `<option>${m}</option>`).join("");
$("gvoice").innerHTML = GEMINI_VOICES.map((v) => `<option>${v}</option>`).join("");
if (settings.gmodel) $("gmodel").value = settings.gmodel;
$("gvoice").value = settings.gvoice || "Orus";
$("gkey").value = localStorage.getItem(LS.gkey) || "";
function save() {
  const s = { voiceOn: $("voiceOn").checked, ttsVoice: $("ttsVoice").value, gmodel: $("gmodel").value, gvoice: $("gvoice").value };
  for (const id of ["exercise", "reps", "sets", "rest", "tempo", "nickname"]) s[id] = $(id).value;
  localStorage.setItem(LS.set, JSON.stringify(s));
}
document.querySelectorAll("input,select").forEach((el) => el.addEventListener("change", save));
function updateLabels() {
  const ex = EX[$("exercise").value];
  $("repsLabel").textContent = ex.unit === "秒" ? "秒数" : "回数";
  $("tempoVal").textContent = `${Number($("tempo").value)}秒に1回`;
  $("tempo").disabled = ex.unit === "秒";
}
$("exercise").addEventListener("change", updateLabels); $("tempo").addEventListener("input", updateLabels); updateLabels();
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const you = () => ($("nickname").value.trim() || "");

function praise(kind, vars = {}, sub, anim = "cheer") {
  const line = pickPraise(kind, { you: you(), ...vars }, sub);
  show(FACE_FOR[kind] || "smile", anim); bubble(line); return line;
}

// --- 記録とストリーク ---
const hist = () => JSON.parse(localStorage.getItem(LS.hist) || "[]");
const dayKey = (d = new Date()) => d.toLocaleDateString("sv-SE");
function addHist(e) { const h = hist(); h.unshift(e); localStorage.setItem(LS.hist, JSON.stringify(h.slice(0, 500))); renderHist(); }
function streak() {
  const days = new Set(hist().map((h) => h.date));
  let n = 0, d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function renderHist() {
  const h = hist(), s = streak();
  $("streak").textContent = s ? `🔥 ${s}日連続` : "今日からスタート";
  const today = h.filter((x) => x.date === dayKey());
  const sum = {}; today.forEach((x) => { sum[x.name] = (sum[x.name] || 0) + x.total; });
  $("today").textContent = today.length ? "今日：" + Object.entries(sum).map(([k, v]) => `${k} ${v}${k === "プランク" ? "秒" : "回"}`).join("、") : "今日はまだ記録なし";
  $("history").innerHTML = h.slice(0, 30).map((x) => `<li>${x.date}　${x.name}　${x.reps}${x.unit}×${x.sets}セット${x.done < x.sets ? `（${x.done}セットで終了）` : ""}</li>`).join("");
}
$("clearHist").onclick = () => { if (confirm("記録を全部消してええ？")) { localStorage.removeItem(LS.hist); renderHist(); } };
renderHist();

// --- トレーニング本体 ---
const run = { active: false, paused: false, stop: false };
async function wait(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end || run.paused) { if (run.stop) throw new Error("stop"); await sleep(50); }
}
function setButtons(active) { $("start").disabled = active; $("pause").disabled = !active; $("stop").disabled = !active; $("setup").querySelectorAll("input,select").forEach((e) => (e.disabled = active)); if (!active) updateLabels(); }

async function workout() {
  const key = $("exercise").value, ex = EX[key];
  const reps = Math.max(1, Math.min(300, +$("reps").value || 10)), sets = Math.max(1, Math.min(10, +$("sets").value || 3));
  const rest = Math.max(5, +$("rest").value || 30), tempo = Math.max(1, +$("tempo").value || 2.5) * 1000;
  Object.assign(run, { active: true, paused: false, stop: false }); setButtons(true);
  let done = 0, cheered = 0, finished = false, stopped = false;
  try {
    const h0 = hist(), last = h0[0];
    const gap = last ? Math.round((new Date(dayKey()) - new Date(last.date)) / 86400000) : 0;
    if (gap >= 3) { await speak(praise("comeback")); await wait(300); }
    else { await speak(praise("hello", { ex: ex.name })); await wait(200); }
    const hi = `${ex.name}${reps}${ex.unit}、${sets}セットいきましょう！`;
    bubble(hi); await speak(hi); await wait(400);
    for (let s = 1; s <= sets; s++) {
      $("sub").textContent = `${s} / ${sets} セット`;
      show("neutral"); bubble(`${s}セット目、よーい…`); await speak(s === 1 ? "よーい、スタート！" : `${s}セット目、いきます！`); await wait(500);
      const cheerAt = reps >= 8 && cheered < 1 && Math.random() < 0.35 ? Math.floor(reps * (0.6 + Math.random() * 0.2)) : -1;
      if (key === "plank") {
        for (let t = 1; t <= reps; t++) {
          $("big").textContent = reps - t + 1;
          const left = reps - t + 1;
          if (t === cheerAt) { cheered++; speak(praise("call")); }
          else if (left <= 5) { show("neutral"); bubble(`あと${left}秒！`); speak(String(left)); }
          else if (t % 10 === 0) { show("smile"); const f = pick(ex.form); bubble(f); speak(f); }
          else if (t === Math.floor(reps / 2) || (reps >= 40 && t === Math.floor(reps / 4))) { speak(praise("mid")); }
          else if (t % 2) show(t % 4 === 1 ? "neutral" : "smile");
          await wait(1000);
        }
      } else {
        for (let r = 1; r <= reps; r++) {
          $("big").textContent = r;
          if (r === cheerAt) { cheered++; const c = praise("call"); await speak(`${countWord(r)}、${c}`); }
          else if (r === reps) { show("fun"); bubble("ラスト！"); speak(`ラスト、${countWord(r)}！`); }
          else if (r === Math.floor(reps / 2) && reps >= 6) { const m = praise("mid", {}, undefined, "bounce"); await speak(`${countWord(r)}、${m}`); }
          else if (r % 7 === 3 && reps >= 6) { show("neutral"); const f = pick(ex.form); bubble(f); speak(countWord(r)); }
          else { show(r % 2 ? "neutral" : "smile"); bubble(countWord(r)); speak(countWord(r)); }
          await wait(tempo);
        }
      }
      done = s; $("big").textContent = "";
      if (s < sets) {
        await speak(praise("setEnd")); const p = `${rest}秒休憩っす。水飲んでくださいね`;
        bubble(p); speak(p);
        for (let t = rest; t > 0; t--) {
          $("big").textContent = t; $("sub").textContent = `休憩中（次は ${s + 1} セット目）`;
          if (t === 10) { show("neutral"); speak("あと10秒"); bubble("あと10秒、準備して"); }
          if (t <= 3) { show("neutral"); speak(String(t)); }
          await wait(1000);
        }
        $("big").textContent = "";
      }
    }
    $("sub").textContent = "完了！"; await speak(praise("sessionEnd", { ex: ex.name })); finished = true;
  } catch (e) {
    if (e.message !== "stop") throw e;
    stopped = true; speechSynthesis?.cancel?.(); $("big").textContent = ""; $("sub").textContent = "";
    speak(done ? praise("stopEarly", { n: done }) : praise("stopZero"));
  } finally {
    if (done) {
      const before = hist().filter((x) => x.key === key);
      const prevBest = before.reduce((m, x) => Math.max(m, x.total), 0);
      const streakBefore = streak(), hadToday = hist().some((x) => x.date === dayKey());
      addHist({ date: dayKey(), at: new Date().toISOString(), key, name: ex.name, unit: ex.unit, reps, sets, done, total: reps * done });
      const extra = [];
      if (prevBest && reps * done > prevBest) extra.push(["pb", { ex: ex.name, n: `${reps * done - prevBest}${ex.unit}` }]);
      const st = streak();
      if (!hadToday && st !== streakBefore && [3, 7, 14, 30].includes(st)) extra.push(["streak", {}, st]);
      (async () => { for (const [k, v, sub] of extra) { await sleep(stopped ? 2500 : 600); await speak(praise(k, v, sub)); } })();
    }
    Object.assign(run, { active: false, paused: false }); setButtons(false); $("pause").textContent = "一時停止";
  }
}
$("start").onclick = () => { save(); workout().catch((e) => { $("error").textContent = e.message; }); };
$("pause").onclick = () => { run.paused = !run.paused; $("pause").textContent = run.paused ? "再開" : "一時停止"; if (run.paused) { speechSynthesis?.cancel?.(); show("shy"); bubble("ちょっと休憩っすね"); } };
$("stop").onclick = () => { run.stop = true; run.paused = false; };
face.onclick = () => { if (!run.active) { show("fun", "cheer"); const t = pick(["呼びました？", "今日も一緒にがんばりましょう", "水分補給、忘れてないっすか？"]); bubble(t); speak(t); } };

// --- Gemini Live モード ---
let gtext = "";
const gemini = new GeminiCoach({
  onStatus: (t) => { $("gstatus").textContent = t; if (t === "未接続") $("gconnect").textContent = "Gemini で話す"; },
  onError: (t) => { $("error").textContent = t; },
  onText: (t) => { if (t === null) { gtext = ""; return; } gtext += t; bubble(gtext); },
  onSpeaking: (on) => { if (on) show(Math.random() < 0.3 ? "fun" : "smile"); },
  onBadKey: () => { localStorage.removeItem(LS.gkey); $("gkey").value = ""; $("error").textContent = "この Gemini キーは使えません（残高切れか無効）。保存したキーは消しました。新しいキーを入れてな。"; },
});
$("gconnect").onclick = async () => {
  $("error").textContent = "";
  if (gemini.connected) { gemini.disconnect(); $("gconnect").textContent = "Gemini で話す"; return; }
  const key = $("gkey").value.trim();
  if (!key) { $("error").textContent = "Gemini の API キーを入れてな。キーはこのブラウザにだけ保存されます。"; return; }
  localStorage.setItem(LS.gkey, key); save();
  $("gstatus").textContent = "接続中…"; $("gconnect").textContent = "切断する";
  speechSynthesis?.cancel?.();
  try { await gemini.connect({ key, model: $("gmodel").value, voice: $("gvoice").value, nickname: you() }); }
  catch (e) { $("error").textContent = e.message; gemini.disconnect(); }
};
