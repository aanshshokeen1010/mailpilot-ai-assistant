export const SETTINGS_STORAGE_KEY = 'mailpilot_settings';

export const DEFAULT_SETTINGS = {
  fetch_limit: '10',
  default_action: 'draft',
  fetch_priority: 'all',
  ai_tone: 'professional',
  ai_detail_level: 'medium',
  ai_details: '',
  ai_persona: '',
  accent_color: '#8b5cf6'
};

export function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLocalSettings(settings) {
  const nextSettings = { ...DEFAULT_SETTINGS, ...settings };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export function mergeServerSettings(localSettings, serverSettings) {
  const merged = { ...DEFAULT_SETTINGS, ...localSettings };
  for (const [key, value] of Object.entries(serverSettings || {})) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}
