const PRESETS = {
  // Local development from the dev machine (JS on the same machine as the server)
  localhost: 'http://localhost:5000/api',
  // Android emulator -> host machine (emulator maps 10.0.2.2 to the PC running the server)
  androidEmulator: 'http://10.0.2.2:5000/api',
  // Physical phone on the same Wi-Fi: set this to the machine's LAN IP, e.g. 'http://192.168.1.10:5000/api'
  lan: '',
  // Deployed backend URL (fill in when a production/deployed API exists)
  production: '',
};

// Single switch for the whole app. Change this one value to retarget the API.
// - Building/testing in the Android emulator: androidEmulator (default below)
// - Running the JS layer on the dev machine itself: localhost
// - Running on a physical phone: fill in PRESETS.lan first
let currentBaseUrl = PRESETS.androidEmulator;

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

export { PRESETS };
