// Hermes (React Native) has no crypto.getRandomValues; Mera + @noble need it. Load before any
// code that imports them (see index.ts). crypto.subtle is NOT required — Mera's PRF-derived
// account path avoids it.
import { getRandomValues } from "expo-crypto";

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}
