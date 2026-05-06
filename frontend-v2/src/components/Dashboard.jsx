import { useState, useEffect } from 'react';
import { Mail, CheckSquare, Clock, RefreshCw, Activity, Sparkles, ChevronRight, Zap, Shield } from 'lucide-react';
import { fetchAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalRLStatus } from '../reinforcementLearning';

export default function Dashboard({ emails = [], tasks = [], navigateTo, isToastVisible }) {
  const [stats, setStats] = useState({
    pending: 0,
    completed: 0,
    fetchLimit: 10
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [brief, setBrief] = useState('');
  const [isBriefing, setIsBriefing] = useState(false);

  const [rlStatus, setRlStatus] = useState({ alignment: 0, status: 'Initializing...', samples: 0 });

  const fetchStats = async () => {
    // Stats are now derived from props (emails/tasks) for maximum performance
    setStats({
      pending: tasks.filter(t => !t.completed).length,
      completed: tasks.filter(t => t.completed).length,
      fetchLimit: stats.fetchLimit
    });
    
    setIsSyncing(true);
    try {
      const settingsData = await fetchAPI('/settings');
      setStats(prev => ({
        ...prev,
        fetchLimit: parseInt(settingsData.fetch_limit, 10) || 10
      }));
      // Strictly on user's device: fetch alignment from localStorage
      setRlStatus(getLocalRLStatus());
    } catch (err) {
      console.warn("Unable to fetch settings:", err);
      setRlStatus(getLocalRLStatus());
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [emails, tasks]); // Update stats whenever data changes

  const generateBrief = async () => {
    setIsBriefing(true);
    try {
      if (emails.length === 0) {
        setBrief("Boss, your inbox is currently clear of actionable data. I'll prepare a brief once new intelligence arrives.");
        return;
      }
      const data = await fetchAPI('/morning-brief', {
        method: 'POST',
        body: JSON.stringify({
          emails: emails.slice(0, 8),
          tasks: tasks.filter(t => !t.completed).slice(0, 8)
        })
      });
      setBrief(data.brief || '');
    } catch {
      setBrief('Boss, the brief could not be assembled this time. Please check your connection.');
    } finally {
      setIsBriefing(false);
    }
  };

  const cards = [
    { label: 'Emails Analyzed', value: emails.length, icon: Mail, color: 'text-primary', glow: 'shadow-primary/20', bg: 'bg-primary/10' },
    { label: 'Pending Tasks', value: stats.pending, icon: Clock, color: 'text-amber-400', glow: 'shadow-amber-500/20', bg: 'bg-amber-500/10' },
    { label: 'Completed Tasks', value: stats.completed, icon: CheckSquare, color: 'text-emerald-400', glow: 'shadow-emerald-500/20', bg: 'bg-emerald-500/10' },
    { label: 'Scan Limit', value: stats.fetchLimit, icon: Activity, color: 'text-accent', glow: 'shadow-accent/20', bg: 'bg-accent/10' },
  ];

  return (
    <div className="space-y-12 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-5xl font-extrabold text-white tracking-tight leading-tight"
          >
            Insights <span className="text-gradient">Overview.</span>
          </motion.h2>
          <p className="text-slate-400 mt-3 text-lg font-medium">Welcome back — here's what your AI has organized today.</p>
        </div>
        <div className="flex gap-3">
          <AnimatePresence>
            {!isToastVisible && (
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={fetchStats}
                disabled={isSyncing}
                className="btn-outline px-4 py-2 flex items-center gap-2 group border-white/10 hover:border-primary/50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                <span className="text-[10px] font-black uppercase tracking-widest">Sync</span>
              </motion.button>
            )}
          </AnimatePresence>
          <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live</span>
          </div>
        </div>
      </header>

      {/* Main Stats Grid */}
      <motion.div 
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.1 } }
        }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {cards.map((card, i) => (
          <motion.div 
            key={i}
            variants={{
              hidden: { opacity: 0, y: 20, scale: 0.95 },
              visible: { opacity: 1, y: 0, scale: 1 }
            }}
            className="premium-card p-8 group hover:border-primary/50 transition-all duration-500 flex flex-col items-center text-center space-y-4 cursor-pointer"
            whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
          >
            <div className={`w-14 h-14 rounded-2xl ${card.bg} flex items-center justify-center ${card.color} shadow-lg ${card.glow} group-hover:scale-110 transition-transform`}>
              <card.icon className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{card.label}</p>
               <h3 className="text-4xl font-black text-white tracking-tighter">{card.value}</h3>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Intelligence Briefing Section */}
      <section className="premium-card p-10 md:p-12 relative overflow-hidden border-white/10 shadow-[0_0_80px_rgba(var(--accent-primary-rgb,139,92,246),0.05)]">
        <motion.div 
          animate={{ 
            scale: [1, 1.05, 1],
            opacity: [0.03, 0.05, 0.03]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 right-0 p-12 pointer-events-none"
        >
          <Sparkles className="w-64 h-64 text-primary" />
        </motion.div>
        
        <div className="relative z-10 flex flex-col lg:flex-row gap-12 items-start">
          <div className="flex-1 space-y-8">
            <div className="flex items-center gap-4">
               <motion.div 
                 whileHover={{ rotate: 15 }}
                 className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary"
               >
                 <Sparkles className="w-7 h-7" />
               </motion.div>
               <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">Morning Intelligence Briefing</h3>
                  <p className="text-slate-400 font-medium">Strategic summary of your immediate priorities.</p>
               </div>
            </div>
            
            <div className="min-h-[160px] flex items-center justify-center p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 text-slate-300">
              <AnimatePresence mode="wait">
                {isBriefing ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4"
                  >
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Assembling priorities...</p>
                  </motion.div>
                ) : brief ? (
                  <motion.p 
                    key="brief"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl leading-relaxed italic font-medium text-center"
                  >
                    "{brief}"
                  </motion.p>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center space-y-4"
                  >
                    <p className="text-slate-500 italic">No briefing active. Click below to initialize today's intelligence protocols.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={generateBrief}
              disabled={isBriefing}
              className="px-10 py-5 rounded-2xl bg-white text-slate-950 font-black uppercase tracking-widest text-[11px] shadow-xl shadow-white/5 hover:bg-primary hover:text-white transition-all duration-500 flex items-center gap-3 disabled:opacity-50"
            >
              {isBriefing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {brief ? 'Regenerate Briefing' : 'Generate Strategic Brief'}
            </button>
          </div>

          <div className="w-full lg:w-96 space-y-8">
            <div className="premium-card p-8 bg-gradient-to-br from-primary/10 to-transparent border-primary/20 relative overflow-hidden group">
              <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E')] opacity-[0.02]" />
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                <Shield className="w-20 h-20 text-primary rotate-12" />
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary block mb-1">Bureau Link</span>
                    <h4 className="text-xl font-black text-white">Neural Alignment</h4>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-2xl font-black text-white">{rlStatus.alignment}%</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                      Synchronized
                    </span>
                  </div>
                </div>

                <div className="relative h-4 w-full bg-slate-950 rounded-full border border-white/5 p-1 mb-8 shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${rlStatus.alignment}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-primary via-cyan-500 to-primary bg-[length:200%_100%] animate-shimmer shadow-[0_0_20px_rgba(var(--accent-primary-rgb,139,92,246),0.4)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Alignment Status</p>
                    <p className="text-xs font-bold text-slate-200">{rlStatus.status}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Learning Nodes</p>
                    <p className="text-xs font-black text-primary">{rlStatus.samples}</p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-6 h-6 rounded-full bg-slate-800 border border-slate-900 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-slate-500" />
                      </div>
                    ))}
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Strictly On-Device Telemetry</span>
                </div>
              </div>
            </div>

            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-2">Immediate Targets</h4>
            <div className="space-y-3">
              {tasks.filter(t => !t.completed).slice(0, 3).map((task, i) => (
                <div 
                  key={i}
                  className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-primary/30 transition-all cursor-pointer group"
                  onClick={() => navigateTo('tasks')}
                >
                  <p className="text-sm font-bold text-slate-300 line-clamp-1 group-hover:text-white transition-colors">{task.task}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <div className={`w-1.5 h-1.5 rounded-full ${task.priority <= 2 ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Priority Level {task.priority}</span>
                  </div>
                </div>
              ))}
              {tasks.filter(t => !t.completed).length === 0 && (
                <div className="p-8 rounded-2xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center text-center opacity-40">
                  <CheckSquare className="w-8 h-8 text-slate-600 mb-3" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">All targets cleared</p>
                </div>
              )}
            </div>
            <button 
              onClick={() => navigateTo('tasks')}
              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary transition-colors py-2"
            >
              View Strategic Roadmap <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
