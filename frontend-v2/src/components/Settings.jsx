import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Zap, Database, Sliders, Cpu, Loader2, Globe, Shield } from 'lucide-react';
import { fetchAPI } from '../api';
import { DEFAULT_SETTINGS, loadLocalSettings, mergeServerSettings, saveLocalSettings } from '../settingsStorage';
import { clearMailpilotCaches, saveTasksCache } from '../cacheStorage';

export default function Settings({ showToast, userEmail, setTasks }) {
  const [formData, setFormData] = useState(() => loadLocalSettings());
  const [saving, setSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);

  useEffect(() => {
    fetchAPI('/settings')
      .then(data => {
        if (data) {
          const merged = saveLocalSettings(mergeServerSettings(loadLocalSettings(), data));
          setFormData(merged);
        }
      })
      .catch(() => showToast('error', "Sorry Boss, couldn't load your preferences."))
      .finally(() => setIsSyncing(false));
  }, [showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const settingsToSave = saveLocalSettings({ ...DEFAULT_SETTINGS, ...formData });
    try {
      await fetchAPI('/settings', {
        method: 'POST',
        body: JSON.stringify(settingsToSave)
      });
      showToast('success', "Preferences synchronized, Boss! I've updated the Bureau's logic.");
    } catch {
      showToast('info', "Saved locally, Boss. Vercel storage will sync when the backend database is available.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-full mx-auto space-y-12 pb-32">
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
                     onChange={(e) => setFormData({...formData, ai_details: e.target.value})}
                     placeholder="Ex: Use concise, action-oriented language. Never use 'Best regards'..."
                     className="w-full h-32 bg-white/[0.02] border border-white/10 rounded-3xl p-6 text-slate-200 focus:outline-none focus:border-violet-500/50 transition-all resize-none font-medium leading-relaxed"
                   />
                </div>

                <div className="space-y-3">
                   <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Strategic Triage Profile (Bio)</label>
                   <textarea 
                     value={formData.ai_persona}
                     onChange={(e) => setFormData({...formData, ai_persona: e.target.value})}
                     placeholder="Ex: I am the CEO of a tech startup. Action required should be high-priority client needs. Newsletters are noise..."
                     className="w-full h-32 bg-white/[0.02] border border-white/10 rounded-3xl p-6 text-slate-200 focus:outline-none focus:border-violet-500/50 transition-all resize-none font-medium leading-relaxed"
                   />
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
                          onClick={() => setFormData({...formData, ai_tone: tone})}
                          className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
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
                          onClick={() => setFormData({...formData, ai_detail_level: level})}
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
                    type="range" min="1" max="50" step="1"
                    className="w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer accent-primary"
                    value={formData.fetch_limit}
                    onChange={(e) => setFormData({...formData, fetch_limit: e.target.value})}
                  />
               </div>

               <div className="space-y-3">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Inbox Priority</label>
                  <div className="relative">
                    <select 
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-slate-200 font-bold focus:outline-none focus:border-primary appearance-none cursor-pointer"
                      value={formData.fetch_priority}
                      onChange={(e) => setFormData({...formData, fetch_priority: e.target.value})}
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
                        setFormData({...formData, accent_color: color});
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

          <div className="premium-card p-8 border-rose-500/20 group cursor-pointer" onClick={async () => {
              if (window.confirm('CRITICAL: Are you sure? This will wipe all action items across the dashboard. This cannot be undone.')) {
                await fetchAPI('/tasks/clear', { method: 'DELETE' });
                setTasks?.([]);
                saveTasksCache([]);
                clearMailpilotCaches();
                showToast('success', 'Workspace Purged.');
              }
          }}>
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all">
                   <SettingsIcon className="w-5 h-5" />
                </div>
                <div>
                   <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Danger Zone</h4>
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Purge all local tasks</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-10 right-10 left-10 md:left-auto md:w-96 z-30">
        <button 
          onClick={handleSubmit}
          disabled={saving}
          className="w-full btn-gradient h-16 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Synchronize Configuration
        </button>
      </div>
    </div>
  );
}
