// PCM16 little-endian mono helpers for the ElevenLabs Realtime WebSocket.
// Input and output are raw audio/pcm at 24000 Hz, with no WAV header.

export const TARGET_RATE = 24000;

export function resampleLinear(input, fromRate, toRate) {
  const samples = input instanceof Float32Array ? input : Float32Array.from(input);
  if (!fromRate || !toRate || fromRate === toRate) return samples;
  if (samples.length === 0) return new Float32Array(0);
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(outLength);
  const last = samples.length - 1;
  for (let i = 0; i < outLength; i += 1) {
    const position = i * ratio;
    const left = Math.min(Math.floor(position), last);
    const right = Math.min(left + 1, last);
    const mix = position - left;
    out[i] = samples[left] * (1 - mix) + samples[right] * mix;
  }
  return out;
}

export function floatToPcm16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pcm16BytesToFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - (bytes.byteLength % 2));
  const count = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

export function concatFloat32(left, right) {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const merged = new Float32Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}
