const PRESETS = {
  // Local development from the dev machine (JS on the same machine as the server)
  localhost: 'http://localhost:5000/api',
  // Android emulator -> host machine (emulator maps 10.0.2.2 to the PC running the server)
  androidEmulator: 'http://10.0.2.2:5000/api',
  // Physical tablet on the same Wi-Fi: this machine's LAN IP (Wi-Fi adapter).
  lan: 'http://192.168.31.222:5000/api',
  // Deployed backend URL (public HTTPS Render service).
  production: 'https://atr-resturant.onrender.com/api',
};

// Single switch for the whole app. Change this one value to retarget the API.
// - Deployed public HTTPS backend (Render): production (active below)
// - Physical tablet on Wi-Fi (same LAN, no USB): lan
// - USB reverse tethering (adb reverse tcp:5000 tcp:5000): localhost
// - Building/testing in the Android emulator: androidEmulator
let currentBaseUrl = PRESETS.production;

export function setApiPreset(presetName) {
  const url = PRESETS[presetName];
  if (!url) {
    throw new Error(
      `Preset "${presetName}" is empty. Set a URL in src/api/config.js first.`,
    );
  }
  currentBaseUrl = url;
}

export function setBaseUrl(url) {
  if (!url) {
    throw new Error('setBaseUrl requires a non-empty URL');
  }
  currentBaseUrl = url;
}

export function getBaseUrl() {
  return currentBaseUrl;
}

// Socket.IO shares the host/port with the REST API but not the `/api` prefix.
export function getSocketUrl() {
  return currentBaseUrl.replace(/\/api\/?$/, '');
}

export { PRESETS };
