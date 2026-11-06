const PRESETS = {
  production: 'https://atr-resturant.onrender.com/api',
};

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
