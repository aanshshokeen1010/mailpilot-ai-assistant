/**
 * Strategic Reinforcement Learning Engine (On-Device)
 * 
 * Tracks user interaction patterns strictly in localStorage to compute 
 * "Neural Alignment" without sending telemetry to the server.
 */

const STORAGE_KEY = 'mailpilot_neural_alignment';

const INITIAL_STATE = {
  alignment: 0,
  samples: 0,
  status: 'Training Initializing',
  history: [],
  lastPulse: Date.now()
};

export const getLocalRLStatus = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(saved);
    // Dynamic status calculation
    let status = "Active Learning";
    if (parsed.alignment > 90) status = "Neural Parity Achieved";
    else if (parsed.alignment > 60) status = "Advanced Synchronization";
    else if (parsed.alignment > 25) status = "Strategic Alignment";
    
    return { ...parsed, status };
  } catch {
    return INITIAL_STATE;
  }
};

export const trackInteraction = (type, weight = 1) => {
  const state = getLocalRLStatus();
  
  // Weights:
  // feedback: 10
  // task_complete: 5
  // analysis: 2
  // setting_change: 3
  
  const increment = weight;
  const newAlignment = Math.min(100, state.alignment + increment);
  const newSamples = state.samples + 1;
  
  const newState = {
    ...state,
    alignment: newAlignment,
    samples: newSamples,
    lastPulse: Date.now()
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  return newState;
};

export const resetAlignment = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_STATE));
};
