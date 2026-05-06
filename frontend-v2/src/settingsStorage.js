export const SETTINGS_STORAGE_KEY = 'mailpilot_settings';

export const DEFAULT_SETTINGS = {
  fetch_limit: '10',
  default_action: 'draft',
  fetch_priority: 'all',
  ai_tone: 'professional',
  ai_detail_level: 'medium',
  ai_details: '',
  ai_persona: '',
  university_mode: false,
  university_roll_number: '',
  university_semester: '',
  university_section: '',
  university_course: '',
  university_specialization: '',
  university_campus: '',
  university_ignore_other_sections: false,
  university_filter_mode: 'balanced',
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

export function buildEffectivePersona(settings = {}) {
  const data = { ...DEFAULT_SETTINGS, ...settings };
  const lines = [];
  if (data.ai_persona) lines.push(data.ai_persona.trim());

  if (data.university_mode) {
    lines.push('UNIVERSITY MODE ACTIVE: apply strict academic relevance filtering.');
    if (data.university_roll_number) lines.push(`Roll number: ${data.university_roll_number}`);
    if (data.university_semester) lines.push(`Semester: ${data.university_semester}`);
    if (data.university_section) lines.push(`Section: ${data.university_section}`);
    if (data.university_course) lines.push(`Course: ${data.university_course}`);
    if (data.university_specialization) lines.push(`Specialization: ${data.university_specialization}`);
    if (data.university_campus) lines.push(`Campus: ${data.university_campus}`);
    const strictMode = data.university_filter_mode === 'strict';
    lines.push(strictMode
      ? 'University filter mode: STRICT MATCH. If an academic email is clearly for a different section, roll number, semester, course, specialization, or campus, classify it as FILTERED_NOISE unless it also explicitly applies to me.'
      : 'University filter mode: BALANCED CAMPUS. Use academic profile strongly, but keep nearby section/course notices as STRATEGIC_FYI when they may still affect me.');
    lines.push('Keep Assignment Update, Quiz Notice, and Course Alert as separate categories when they fit.');
  }

  return lines.filter(Boolean).join('\n');
}
