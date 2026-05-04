export const TASKS_CACHE_KEY = 'mailpilot_tasks_cache';

export function saveTasksCache(tasks) {
  localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks || []));
}

export function clearMailpilotCaches({ includeSettings = false } = {}) {
  localStorage.removeItem(TASKS_CACHE_KEY);
  if (includeSettings) {
    localStorage.removeItem('mailpilot_settings');
  }

  Object.keys(localStorage)
    .filter((key) => key.startsWith('mailpilot_summary_'))
    .forEach((key) => localStorage.removeItem(key));
}
