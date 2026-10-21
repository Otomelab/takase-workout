// Gemini Live（ブラウザから直接WebSocket、AI Studioのキー）。slot-060 のコードを流用。
import { coachInstructions } from "./persona.js";
import { resampleLinear, floatToPcm16, bytesToBase64, base64ToBytes, pcm16BytesToFloat32, concatFloat32 } from "./audio-util.js";

const URL_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=";
const IN_RATE = 16000, OUT_RATE = 24000;
export const GEMINI_MODELS = ["gemini-3.1-flash-live-preview", "gemini-3.8-live"];
export const GEMINI_VOICES = ["Orus", "Puck", "Charon", "Fenrir", "Algenib", "Gacrux", "Zephyr"];

export class GeminiCoach {
  constructor({ onStatus, onError, onText, onSpeaking, onBadKey }) {
    Object.assign(this, { onStatus, onError, onText, onSpeaking, onBadKey });
    this.ws = null; this.ctx = null; this.pending = new Float32Array(0); this.next = 0; this.sources = new Set(); this.closing = false;
  }
  get connected() { return !!this.ws; }
  async connect({ key, model, voice, nickname }) {
    this.closing = false;
    this.ctx = new AudioContext(); await this.ctx.resume();
    const ws = new WebSocket(URL_BASE + encodeURIComponent(key)); this.ws = ws;
    ws.onopen = async () => {
      ws.send(JSON.stringify({ setup: {
        model: `models/${GEMINI_MODELS.includes(model) ? model : GEMINI_MODELS[0]}`,
        generationConfig: { responseModalities: ["AUDIO"], temperature: 0.9,
          speechConfig: { languageCode: "ja-JP", voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Orus" } } } },
        systemInstruction: { parts: [{ text: coachInstructions(nickname) }] },
        outputAudioTranscription: {},
      } }));
      try { await this.startMic(); } catch (e) { this.onError(`マイクを開始できませんでした。${e.message}`); }
    };
    ws.onmessage = async (m) => { let t = m.data; if (typeof t !== "string") t = await t.text(); try { this.handle(JSON.parse(t)); } catch {} };
    ws.onerror = () => this.onError("Gemini への接続でエラーが起きました。キーとネットワークを確認してください。");
    ws.onclose = (ev) => {
      if (!this.closing && /credit|depleted|api key|permission|invalid|unauthenticated/i.test(ev.reason || "")) this.onBadKey();
      else if (!this.closing) this.onError(`接続が閉じました（${[ev.code, ev.reason].filter(Boolean).join(" ") || "理由なし"}）`);
      this.cleanup(); this.onStatus("未接続");
    };
  }
  async startMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    await this.ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (m) => this.onMic(m.data);
    src.connect(this.node);
  }
  onMic(samples) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.pending = concatFloat32(this.pending, resampleLinear(samples, this.ctx.sampleRate, IN_RATE));
    if (this.pending.length < IN_RATE / 10) return;
    const b64 = bytesToBase64(new Uint8Array(floatToPcm16(this.pending))); this.pending = new Float32Array(0);
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64, mimeType: `audio/pcm;rate=${IN_RATE}` } } }));
  }
  handle(msg) {
    if (msg.error) { this.onError(msg.error.message || "Gemini エラー"); return; }
    if (msg.setupComplete) { this.onStatus("つながったで。話しかけてみて"); this.say("こんにちは、と挨拶して、今日のトレーニングの希望を短く聞いてください。"); return; }
    const sc = msg.serverContent; if (!sc) return;
    if (sc.interrupted) this.stopAudio();
    for (const p of sc.modelTurn?.parts || []) if (p.inlineData?.data) this.play(base64ToBytes(p.inlineData.data));
    if (sc.outputTranscription?.text) this.onText(sc.outputTranscription.text);
    if (sc.turnComplete) this.onText(null);
  }
  say(text) { this.ws?.send(JSON.stringify({ realtimeInput: { text } })); }
  play(bytes) {
    const f = pcm16BytesToFloat32(bytes); if (!f.length) return;
    const buf = this.ctx.createBuffer(1, f.length, OUT_RATE); buf.getChannelData(0).set(f);
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.04, this.next); s.start(at); this.next = at + buf.duration;
    this.sources.add(s); this.onSpeaking(true);
    s.onended = () => { this.sources.delete(s); if (!this.sources.size) this.onSpeaking(false); };
  }
  stopAudio() { for (const s of this.sources) { try { s.stop(); } catch {} } this.sources.clear(); this.next = 0; this.onSpeaking(false); }
  cleanup() {
    this.stopAudio(); this.node?.disconnect(); this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {}); this.ws = null; this.ctx = null; this.pending = new Float32Array(0);
  }
  disconnect() { this.closing = true; try { this.ws?.close(); } catch {} this.cleanup(); }
}
