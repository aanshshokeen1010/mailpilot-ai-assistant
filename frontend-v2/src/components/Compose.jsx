import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Wand2, Copy, Loader2, ListTodo, FileText, RotateCcw, MessageSquarePlus, Maximize2, Minimize2, Shield } from 'lucide-react';
import { fetchAPI } from '../api';
import { loadLocalSettings } from '../settingsStorage';
import { saveTasksCache } from '../cacheStorage';

export default function Compose({ showToast, setTasks }) {
  const [emailText, setEmailText] = useState('');
  const [loadingReply, setLoadingReply] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [activeRefinement, setActiveRefinement] = useState(null);
  
  const [generatedReply, setGeneratedReply] = useState('');
  const [extractedTasks, setExtractedTasks] = useState([]);

  const handleGenerate = async (toneOverride = null) => {
    if (!emailText.trim()) return showToast('error', "Need some intel to work with, Boss.");
    setLoadingReply(true);
    setActiveRefinement(toneOverride);
    try {
      const settings = loadLocalSettings();
      const data = await fetchAPI('/generate-reply', {
        method: 'POST',
        body: JSON.stringify({ 
          content: emailText,
          tone: toneOverride || settings.ai_tone,
          ai_details: settings.ai_details
        })
      });
      setGeneratedReply(data.reply);
      showToast('success', toneOverride ? `Draft Refined to ${toneOverride}, Boss!` : 'Smart Reply Drafted, Boss.');
    } catch {
      showToast('error', "Sorry Boss, linguistic engine hit a wall.");
    } finally {
      setLoadingReply(false);
      setActiveRefinement(null);
    }
  };

  const handleExtractTasks = async () => {
    if (!emailText.trim()) return showToast('error', "Nothing to extract from, Boss.");
    setLoadingTasks(true);
    try {
      const data = await fetchAPI('/extract-tasks', {
        method: 'POST',
        body: JSON.stringify({ email: emailText })
      });
      const tasks = data.tasks || [];
      setExtractedTasks(tasks);
      if (setTasks) {
        setTasks(prev => {
          const existing = new Map((prev || []).map(task => [String(task.id ?? task.task), task]));
          tasks.forEach(task => existing.set(String(task.id ?? task.task), task));
          const merged = Array.from(existing.values());
          saveTasksCache(merged);
          return merged;
        });
      }
      showToast('success', 'Tasks identified, Boss. Workspace synchronized.');
    } catch {
      showToast('error', "Extraction logic failed, Boss. Connection fuzzy.");
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedReply);
      showToast('success', 'Intel copied to clipboard, Boss.');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = generatedReply;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('success', 'Intel copied to clipboard, Boss.');
    }
  };

  return (
    <div className="max-w-full mx-auto space-y-12 pb-32">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-extrabold text-white tracking-tight">Compose <span className="text-gradient">Studio.</span></h2>
          <p className="text-slate-400 mt-2 text-lg font-medium">Draft persona-aware responses and extract data in real-time.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-xl">
           <Shield className="w-4 h-4 text-emerald-400" />
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Persona Sync Active</span>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        {/* Input Section */}
        <div className="premium-card p-10 flex flex-col space-y-8">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                   <FileText className="w-6 h-6" />
                 </div>
                 <h3 className="text-sm font-black text-white uppercase tracking-widest">Input Analysis</h3>
              </div>
              <button 
                onClick={() => setEmailText('')}
                className="p-3 rounded-xl bg-white/5 text-slate-500 hover:text-white transition-colors"
              >
                 <RotateCcw className="w-4 h-4" />
              </button>
           </div>
           
           <div className="relative flex-1 min-h-[400px]">
              <textarea 
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Paste the email thread or raw message here for analysis..."
                className="w-full h-full bg-white/[0.02] border border-white/10 rounded-3xl p-8 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-cyan-500/50 transition-all resize-none font-medium text-[15px] leading-relaxed"
              />
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => handleGenerate()} 
                disabled={loadingReply} 
                className="btn-gradient h-16 justify-center text-xs font-black uppercase tracking-[0.2em]"
              >
                {loadingReply && !activeRefinement ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                <span>Analyze & Draft</span>
              </button>
              <button 
                onClick={handleExtractTasks} 
                disabled={loadingTasks} 
                className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl h-16 flex items-center justify-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-slate-300 transition-all"
              >
                {loadingTasks ? <Loader2 className="w-5 h-5 animate-spin" /> : <ListTodo className="w-5 h-5 text-amber-400" />}
                <span>Extract Intelligence</span>
              </button>
           </div>
        </div>

        {/* Results Section */}
        <div className="space-y-8">
          <div className="premium-card flex flex-col min-h-[550px] overflow-hidden border-white/10">
            <div className="p-6 border-b border-white/10 bg-gradient-to-r from-violet-600/10 to-transparent flex justify-between items-center">
               <div className="flex items-center gap-3 text-violet-400">
                  <Sparkles className="w-5 h-5" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">AI Draft Selection</span>
               </div>
               <div className="flex items-center gap-2">
                 {generatedReply && (
                   <button onClick={handleCopy} className="p-3 rounded-xl bg-white/5 hover:bg-violet-500 hover:text-white text-slate-400 transition-all border border-white/10">
                      <Copy className="w-4 h-4" />
                   </button>
                 )}
               </div>
            </div>
            
            <div className="flex-1 p-10 flex flex-col">
              <AnimatePresence mode="wait">
                {!generatedReply ? (
                  <motion.div 
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.2 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center text-center space-y-6"
                  >
                    <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/5">
                       <MessageSquarePlus className="w-10 h-10 text-slate-700" />
                    </div>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Awaiting Bureau Command</p>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="output"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col h-full space-y-10"
                  >
                    <textarea 
                      value={generatedReply}
                      onChange={(e) => setGeneratedReply(e.target.value)}
                      className="flex-1 bg-transparent text-slate-200 leading-relaxed whitespace-pre-wrap font-medium text-[16px] italic focus:outline-none resize-none"
                    />
                    
                    {/* Magic Refinement Toolbar */}
                    <div className="pt-6 border-t border-white/5">
                       <div className="flex items-center gap-2 mb-4">
                          <Wand2 className="w-3 h-3 text-violet-400" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Magic Refinements</span>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          {[
                            { id: 'short', label: 'Shorten', icon: Minimize2, tone: 'professional' },
                            { id: 'long', label: 'Expand', icon: Maximize2, tone: 'detailed' },
                            { id: 'casual', label: 'Make Casual', icon: MessageSquarePlus, tone: 'casual' },
                            { id: 'urgent', label: 'Add Urgency', icon: Sparkles, tone: 'urgent' }
                          ].map(ref => (
                            <button
                              key={ref.id}
                              onClick={() => handleGenerate(ref.tone)}
                              disabled={loadingReply}
                              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-violet-500/20 hover:border-violet-500/30 hover:text-violet-400 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                               {loadingReply && activeRefinement === ref.tone ? <Loader2 className="w-3 h-3 animate-spin" /> : <ref.icon className="w-3 h-3" />}
                               {ref.label}
                            </button>
                          ))}
                       </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {extractedTasks.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="premium-card overflow-hidden border-amber-500/20 shadow-[0_20px_50px_rgba(245,158,11,0.05)]"
              >
                <div className="p-6 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center gap-3 text-amber-500">
                   <ListTodo className="w-5 h-5" />
                   <span className="text-[11px] font-black uppercase tracking-[0.2em]">Contextual Action Items</span>
                </div>
                <div className="p-8 space-y-4">
                  {extractedTasks.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-5 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-amber-500/30 transition-all cursor-default">
                      <div className="w-3 h-3 rounded-lg bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
                      <div className="flex-1">
                        <span className="text-slate-200 font-bold text-sm block">{t.task || t}</span>
                        {t.deadline && <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1 block">Due: {t.deadline}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
