import { requireNativeModule } from 'expo-modules-core';

let mod = null;
try {
  mod = requireNativeModule('Lockdown');
} catch (e) {
  mod = null; // Expo Go / missing build — UI degrades gracefully
}

export const Lockdown = mod;
export const nativeAvailable = !!mod;

export async function safeStatus() {
  if (!mod) return null;
  try {
    return await mod.getSessionStatus();
  } catch (e) {
    return null;
  }
}

export function fmtCountdown(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
