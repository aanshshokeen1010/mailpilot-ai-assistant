// Dynamic API detection for production/local parity
const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    // If running on the same host/port as the backend (production)
    if (window.location.hostname !== 'localhost' || window.location.port === '8002') {
      return window.location.origin;
    }
  }
  return 'http://localhost:8002';
};

export const API_BASE = getBaseURL();

export async function fetchAPI(endpoint, options = {}) {
  // Automatically add /api prefix if not present and not a health check
  const path = (endpoint.startsWith('/api') || endpoint.startsWith('/health')) 
    ? endpoint 
    : `/api${endpoint}`;
    
  const url = `${API_BASE}${path}`;
  
  // Bug Fix: Adaptive timeout for large email analysis batches
  const isAnalysis = endpoint.includes('analyze') || endpoint.includes('extract') || endpoint.includes('/coo/') || endpoint.includes('deep-dive') || endpoint.includes('morning-brief');
  const timeoutMs = isAnalysis ? 300000 : 30000; 

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
      signal: controller.signal
    });

    clearTimeout(id);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.detail || `API error: ${response.status}`);
    }
    
    return response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Process is taking longer than expected. Please wait or refresh.', { cause: err });
    }
    console.error(`API Call Failed [${endpoint}]:`, err);
    throw err;
  } finally {
    clearTimeout(id);
  }
}
