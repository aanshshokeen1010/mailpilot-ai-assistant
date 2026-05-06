import { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Save, Zap, Database, Sliders, Cpu, Loader2, Globe, Shield, ChevronDown, AlertCircle, X, GraduationCap } from 'lucide-react';
import { fetchAPI } from '../api';
import { DEFAULT_SETTINGS, loadLocalSettings, mergeServerSettings, saveLocalSettings } from '../settingsStorage';
import { clearMailpilotCaches, saveTasksCache } from '../cacheStorage';

export default function Settings({ showToast, userEmail, setTasks }) {
  const [formData, setFormData] = useState(() => loadLocalSettings());
  const [saving, setSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Synced');
  const [showChangelog, setShowChangelog] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const hasLocalEditsRef = useRef(false);
  const didInitialLoadRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    fetchAPI('/settings')
      .then(data => {
        if (data && isMounted && !hasLocalEditsRef.current) {
          const merged = saveLocalSettings(mergeServerSettings(loadLocalSettings(), data));
          setFormData(merged);
        }
      })
      .catch(() => console.warn("Unable to load remote preferences."))
      .finally(() => {
        if (isMounted) {
          setIsSyncing(false);
          didInitialLoadRef.current = true;
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const updateFormData = (patch) => {
    hasLocalEditsRef.current = true;
    setSaveStatus('Draft saved locally');
    setFormData(prev => {
      const next = saveLocalSettings({ ...prev, ...patch });
      return next;
    });
  };

  const syncSettings = async ({ quiet = false } = {}) => {
    setSaving(true);
    if (!quiet) setIsSyncing(true); // Show the 'Syncing with Bureau...' status for manual saves
    
    const settingsToSave = saveLocalSettings({ ...DEFAULT_SETTINGS, ...formData });
    try {
      setSaveStatus('Autosaving...');
      await fetchAPI('/settings', {
        method: 'POST',
        body: JSON.stringify(settingsToSave)
      });
      hasLocalEditsRef.current = false;
      setSaveStatus('Synced');
      if (!quiet) showToast('success', "Preferences synchronized, Boss! I've updated the Bureau's logic.");
    } catch (err) {
      console.error("Sync Settings Failed:", err);
      setSaveStatus('Offline, saved locally');
      if (!quiet) {
        const msg = err.message?.includes('Unauthorized') 
          ? "Session expired. Please refresh the page." 
          : "Saved locally, Boss. Vercel storage will sync when the backend database is available.";
        showToast('info', msg);
      }
    } finally {
      setSaving(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!didInitialLoadRef.current || !hasLocalEditsRef.current) return;
    const timer = setTimeout(() => {
      syncSettings({ quiet: true });
    }, 1200);
    return () => clearTimeout(timer);
  }, [formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await syncSettings();
  };

  return (
    <div className="max-w-full mx-auto space-y-12 pb-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-extrabold text-white tracking-tight">Intelligence <span className="text-gradient">Control.</span></h2>
          <p className="text-slate-400 mt-2 text-lg font-medium">Configure your AI agent's logic and identity.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-xl">
           <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
             {isSyncing ? 'Syncing with Bureau...' : 'Bureau Synchronized'}
           </span>
           <span className="text-[10px] font-black uppercase tracking-widest text-primary">
             {saveStatus}
           </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Column: AI Identity */}
        <div className="lg:col-span-2 space-y-10">
          <div className="premium-card p-10 space-y-10">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <Zap className="w-6 h-6" />
               </div>
               <div>
                  <h3 className="text-xl font-bold text-white">AI Persona Identity</h3>
                  <p className="text-xs text-slate-500 font-medium">Define how the AI represents you in drafts.</p>
               </div>
            </div>

            <div className="space-y-6">
                <div className="space-y-3">
                   <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Drafting Style Context</label>
                   <textarea 
                     value={formData.ai_details}
                     onChange={(e) => updateFormData({ ai_details: e.target.value })}
                     placeholder="Ex: Use concise, action-oriented language. Never use 'Best regards'..."
                     className="w-full h-32 bg-white/[0.02] border border-white/10 rounded-3xl p-6 text-slate-200 focus:outline-none focus:border-violet-500/50 transition-all resize-none font-medium leading-relaxed"
                   />
                </div>

                <div className="space-y-3">
                   <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Strategic Triage Profile (Bio)</label>
                   <textarea 
                     value={formData.ai_persona}
                     onChange={(e) => updateFormData({ ai_persona: e.target.value })}
                     placeholder="Ex: I am the CEO of a tech startup. Action required should be high-priority client needs. Newsletters are noise..."
                     className="w-full h-32 bg-white/[0.02] border border-white/10 rounded-3xl p-6 text-slate-200 focus:outline-none focus:border-violet-500/50 transition-all resize-none font-medium leading-relaxed"
                   />
                </div>

                <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[0.04] p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">University Mode</h4>
                        <p className="text-xs text-slate-500 font-medium">Structured campus profile for academic filtering.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateFormData({ university_mode: !formData.university_mode })}
                      className={`w-16 h-9 rounded-full p-1 border transition-all ${
                        formData.university_mode ? 'bg-cyan-500/30 border-cyan-400/50' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <span className={`block w-7 h-7 rounded-full transition-transform ${
                        formData.university_mode ? 'translate-x-7 bg-cyan-300' : 'translate-x-0 bg-slate-500'
                      }`} />
                    </button>
                  </div>

                  {formData.university_mode && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          ['Roll Number', 'university_roll_number', 'Ex: 23BCE1234'],
                          ['Semester', 'university_semester', 'Ex: 4'],
                          ['Section', 'university_section', 'Ex: A / CSE-2'],
                          ['Course', 'university_course', 'Ex: B.Tech CSE'],
                          ['Specialization', 'university_specialization', 'Ex: AI/ML'],
                          ['Campus', 'university_campus', 'Ex: Main Campus']
                        ].map(([label, key, placeholder]) => (
                          <div key={key} className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
                            <input
                              value={formData[key] || ''}
                              onChange={(e) => updateFormData({ [key]: e.target.value })}
                              placeholder={placeholder}
                              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-cyan-500/50"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Campus Filter Strength</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[
                            ['balanced', 'Balanced Campus', 'Keeps nearby academic notices as FYI when they may still matter.'],
                            ['strict', 'Strict Match', 'Filters different section, roll, semester, course, or campus aggressively.']
                          ].map(([mode, label, description]) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => updateFormData({
                                university_filter_mode: mode,
                                university_ignore_other_sections: mode === 'strict'
                              })}
                              className={`text-left rounded-2xl border p-4 transition-all ${
                                formData.university_filter_mode === mode
                                  ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
                                  : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
                              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2">{description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Response Tone</label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {['professional', 'casual', 'urgent'].map(tone => (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => updateFormData({ ai_tone: tone })}
                          className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-normal border transition-all ${
                            formData.ai_tone === tone 
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
                            : 'bg-white/5 border-white/5 text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Sliders className="w-4 h-4 text-emerald-400" />
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Summary Depth</label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {['short', 'medium', 'detailed'].map(level => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => updateFormData({ ai_detail_level: level })}
                          className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                            formData.ai_detail_level === level 
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                            : 'bg-white/5 border-white/5 text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div className="premium-card p-10 space-y-10">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Database className="w-6 h-6" />
               </div>
               <div>
                  <h3 className="text-xl font-bold text-white">Data & Constraints</h3>
                  <p className="text-xs text-slate-500 font-medium">Manage how the AI accesses your inbox.</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Analysis Capacity</label>
                    <span className="text-lg font-black text-white">{formData.fetch_limit} Emails</span>
                  </div>
                  <input 
                    type="range" min="1" max="200" step="1"
                    className="w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer accent-primary"
                    value={formData.fetch_limit}
                    onChange={(e) => updateFormData({ fetch_limit: e.target.value })}
                  />
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                    {parseInt(formData.fetch_limit) > 50 ? '💡 Tip: Use Professional Mode in Smart Inbox for high-volume scanning' : 'Adjust how many emails are fetched per scan cycle'}
                  </p>
               </div>

               <div className="space-y-3">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Inbox Priority</label>
                  <div className="relative">
                    <select 
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-slate-200 font-bold focus:outline-none focus:border-primary appearance-none cursor-pointer"
                      value={formData.fetch_priority}
                      onChange={(e) => updateFormData({ fetch_priority: e.target.value })}
                    >
                      <option value="all" className="bg-slate-900">Process All Emails</option>
                      <option value="unread" className="bg-slate-900">Unread Only</option>
                      <option value="important" className="bg-slate-900">Important Flagged</option>
                    </select>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column: Connection & Security */}
        <div className="space-y-10">
          <div className="premium-card p-8 bg-gradient-to-br from-white/5 to-transparent border-white/10">
             <div className="flex flex-col items-center text-center space-y-6">
                <div className="relative">
                   <div className="w-20 h-20 rounded-3xl bg-slate-800 flex items-center justify-center border border-white/10 overflow-hidden">
                      <Globe className="w-10 h-10 text-slate-500" />
                   </div>
                   <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-emerald-500 border-4 border-[#0a0a0a] flex items-center justify-center">
                      <Shield className="w-3 h-3 text-white" />
                   </div>
                </div>
                <div>
                   <h4 className="text-lg font-black text-white tracking-tight">Active Connection</h4>
                   <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{userEmail || 'Secure Tunnel Active'}</p>
                </div>
                <div className="w-full p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                   <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <span className="text-slate-500">Security</span>
                      <span className="text-emerald-400">HMAC-SHA256</span>
                   </div>
                   <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <span className="text-slate-500">Protocol</span>
                      <span className="text-emerald-400">TLS 1.3 / OAuth2</span>
                   </div>
                </div>
             </div>
          </div>
          
          {/* NEW: Interface Mode Switcher */}
          <div className="premium-card p-8 border-primary/20 space-y-6">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-primary" />
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Smart Inbox Experience</label>
            </div>
            
            <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
              <button 
                onClick={() => setInboxMode('classic')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${inboxMode === 'classic' ? 'bg-white/10 text-white shadow-xl ring-1 ring-white/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Classic
              </button>
              <button 
                onClick={() => setInboxMode('elegant')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${inboxMode === 'elegant' ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Professional
              </button>
            </div>
            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest leading-relaxed">
              {inboxMode === 'elegant' 
                ? 'Professional Mode: Optimized for high-density reading and rapid triage.' 
                : 'Classic Mode: Standard conversational layout with traditional controls.'}
            </p>
          </div>

          <div className="premium-card p-8 border-pink-500/20">
             <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <Sliders className="w-4 h-4 text-pink-400" />
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Theme Accent</label>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {['#8b5cf6', '#06b6d4', '#f43f5e', '#10b981'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        document.documentElement.style.setProperty('--accent-primary', color);
                        const secondaryMap = { '#8b5cf6': '#06b6d4', '#06b6d4': '#10b981', '#f43f5e': '#fbbf24', '#10b981': '#3b82f6' };
                        document.documentElement.style.setProperty('--accent-secondary', secondaryMap[color] || '#06b6d4');
                        const hex = color.replace('#', '');
                        const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
                        document.documentElement.style.setProperty('--accent-primary-rgb', `${r}, ${g}, ${b}`);
                        updateFormData({ accent_color: color });
                      }}
                      className={`h-10 rounded-xl border-2 transition-all ${
                        formData.accent_color === color ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'border-transparent opacity-40 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
             </div>
          </div>

          <div className="premium-card p-8 border-amber-500/20 group cursor-pointer" onClick={() => {
              Object.keys(localStorage)
                .filter((key) => key.startsWith('mailpilot_summary_'))
                .forEach((key) => localStorage.removeItem(key));
              showToast('success', 'Cached mail summaries cleared. Your tasks and preferences are untouched.');
          }}>
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                   <Database className="w-5 h-5" />
                </div>
                <div>
                   <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Reset Summaries Only</h4>
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Clear cached AI recaps without touching tasks or persona</p>
                </div>
             </div>
          </div>

          <div className="premium-card p-8 border-rose-500/20 group cursor-pointer" onClick={() => setShowResetConfirm(true)}>
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all">
                   <SettingsIcon className="w-5 h-5" />
                </div>
                <div>
                   <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Full Workspace Reset</h4>
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Clear tasks, cached summaries, and local preferences</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      <section className="premium-card border-white/10 bg-white/[0.02] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowChangelog(prev => !prev)}
          className="w-full p-8 flex items-center justify-between gap-4 text-left"
        >
          <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Changelog</p>
              <h3 className="text-xl font-black text-white mt-1">MailPilot v2.1.1 Bureau Update</h3>
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${showChangelog ? 'rotate-180' : ''}`} />
        </button>
        {showChangelog && (
          <div className="px-8 pb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                'Autosaving persona and drafting preferences',
                'Morning Brief on the dashboard',
                'Deep Dive intelligence for individual emails',
                'Persistent noise and important training shortcuts',
                'Noise hidden from All Intelligence with reversible controls',
                'Stable category collapse, Fast Pass, and COO fallback',
                'Reset summaries only and full workspace reset split',
                'Ctrl/Cmd+K opens James command bar',
                'University Mode with balanced/strict academic filtering',
                'MiniMax judge for persona-aware categories and task precision',
                'Collapsible similar action-item clusters with James context'
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/5 px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-xs font-bold text-slate-400 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {showResetConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
          <div className="premium-card max-w-md w-full p-8 border-rose-500/30 shadow-[0_0_80px_rgba(244,63,94,0.12)]">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-400">Critical Reset</p>
                  <h3 className="text-2xl font-black text-white mt-1">Reset Workspace?</h3>
                </div>
              </div>
              <button onClick={() => setShowResetConfirm(false)} className="p-2 rounded-xl bg-white/5 text-slate-500 hover:text-white transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mt-6">
              This clears server action items plus local summaries, preferences, and cached task state. Your Gmail account, OAuth connection, and emails are not deleted.
            </p>
            <div className="grid grid-cols-2 gap-4 mt-8">
              <button onClick={() => setShowResetConfirm(false)} className="btn-outline h-13 justify-center text-xs font-black uppercase tracking-widest">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await fetchAPI('/tasks/clear', { method: 'DELETE' });
                  setTasks?.([]);
                  saveTasksCache([]);
                  clearMailpilotCaches({ includeSettings: true });
                  setFormData({ ...DEFAULT_SETTINGS });
                  hasLocalEditsRef.current = false;
                  setSaveStatus('Reset locally');
                  setShowResetConfirm(false);
                  showToast('success', 'Workspace reset. Tasks and cached intelligence cleared.');
                }}
                className="h-13 rounded-2xl bg-rose-500 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-10 right-10 left-10 md:left-auto md:w-96 z-[9999] pointer-events-none">
        <button 
          onClick={handleSubmit}
          disabled={saving}
          className="w-full btn-gradient h-16 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 pointer-events-auto hover:shadow-primary/50 transition-shadow"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Synchronize Configuration
        </button>
      </div>
    </div>
  );
}
