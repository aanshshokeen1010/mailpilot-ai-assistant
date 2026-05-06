import { useState, useEffect } from 'react';
import { Mail, CheckSquare, Clock, ChevronRight, RefreshCw, Activity, CheckCircle2, Sparkles, TrendingUp } from 'lucide-react';
import { fetchAPI } from '../api';
import { motion } from 'framer-motion';

export default function Dashboard({ emails = [], tasks = [], navigateTo }) {
  const [stats, setStats] = useState({
    pending: 0,
    completed: 0,
    fetchLimit: 10
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [brief, setBrief] = useState('');
  const [isBriefing, setIsBriefing] = useState(false);

  const fetchStats = async () => {
    setIsSyncing(true);
    try {
      const [statsData, settingsData] = await Promise.all([
        fetchAPI('/stats'),
        fetchAPI('/settings')
      ]);
      setStats({
        pending: statsData.pending_tasks,
        completed: statsData.completed_tasks,
        fetchLimit: parseInt(settingsData.fetch_limit, 10) || 10
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchStats, 0);
    return () => clearTimeout(timer);
  }, []); // Only on mount — use manual refresh for updates

  const generateBrief = async () => {
    setIsBriefing(true);
    try {
      const data = await fetchAPI('/morning-brief', {
        method: 'POST',
        body: JSON.stringify({
          emails: emails.slice(0, 8),
          tasks: tasks.filter(t => !t.completed).slice(0, 8)
        })
      });
      setBrief(data.brief || '');
    } catch {
      setBrief('Boss, the brief could not be assembled this time. Refresh the inbox and try again.');
    } finally {
      setIsBriefing(false);
    }
  };

  const cards = [
    { label: 'Emails Analyzed', value: emails.length, icon: Mail, color: 'text-primary', glow: 'shadow-primary/20', bg: 'bg-primary/10' },
    { label: 'Pending Tasks', value: stats.pending, icon: Clock, color: 'text-amber-400', glow: 'shadow-amber-500/20', bg: 'bg-amber-500/10' },
    { label: 'Completed Tasks', value: stats.completed, icon: CheckSquare, color: 'text-emerald-400', glow: 'shadow-emerald-500/20', bg: 'bg-emerald-500/10' },
    { label: 'Fetch Limit', value: stats.fetchLimit, icon: Activity, color: 'text-accent', glow: 'shadow-accent/20', bg: 'bg-accent/10' },
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
          <button 
            onClick={fetchStats}
            disabled={isSyncing}
            className="btn-outline px-5 py-3 flex items-center gap-2 group"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            <span className="text-xs font-bold uppercase tracking-widest">Update Stats</span>
          </button>
          <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">System Healthy</span>
          </div>
        </div>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => {
              if (card.label.includes('Limit')) navigateTo('settings');
              else navigateTo(card.label.includes('Task') ? 'tasks' : 'emails');
            }}
            className="premium-card p-8 group cursor-pointer hover:translate-y-[-4px]"
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className={`w-14 h-14 rounded-2xl ${card.bg} ${card.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500 shadow-2xl ${card.glow}`}>
                <card.icon className="w-7 h-7" />
              </div>
              <div>
                <div className="text-4xl font-bold text-white mb-2">{card.value}</div>
                <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">{card.label}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <section className="premium-card p-8 border-primary/10 bg-primary/[0.03]">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-3 text-primary">
              <Sparkles className="w-5 h-5" />
              <p className="text-[10px] font-black uppercase tracking-[0.25em]">Morning Brief</p>
            </div>
            <div className="whitespace-pre-wrap text-slate-300 leading-relaxed font-medium">
              {brief || 'Generate a tactical readout from the latest analyzed mail and open action items.'}
            </div>
          </div>
          <button onClick={generateBrief} disabled={isBriefing} className="btn-gradient px-6 py-4 text-xs font-black uppercase tracking-widest">
            {isBriefing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            Build Brief
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <section className="lg:col-span-2 premium-card flex flex-col min-h-[450px]">
          <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="text-xl font-bold flex items-center gap-3 text-white">
              <Mail className="w-6 h-6 text-primary" /> Recent Smart Inbox
            </h3>
            <button onClick={() => navigateTo('emails')} className="btn-outline py-2 px-4 text-xs font-bold uppercase tracking-widest">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
          <div className="flex-1 p-6 space-y-4">
            {emails.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 p-10 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <Mail className="w-8 h-8 opacity-20" />
                </div>
                <p className="italic text-sm">No analysis history found. Start fetching to generate insights.</p>
              </div>
            ) : (
              emails.slice(0, 4).map((email, idx) => (
                <div key={idx} className="p-5 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/10 group flex items-center gap-5">
                   <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                     <Mail className="w-5 h-5 text-slate-400 group-hover:text-primary" />
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-100 text-[15px] truncate">{email.subject || '(No Subject)'}</span>
                        <span className="status-badge bg-primary/10 text-primary border-none scale-90 origin-right">
                          {email.category || 'STRATEGIC_FYI'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1 font-medium">{email.summary}</p>
                   </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Priority Tasks */}
        <section className="premium-card flex flex-col min-h-[450px]">
          <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="text-xl font-bold flex items-center gap-3 text-white">
              <CheckSquare className="w-6 h-6 text-amber-400" /> Priorities
            </h3>
          </div>
          <div className="flex-1 p-8 space-y-5">
            {tasks.filter(t => !t.completed).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 p-10 text-center space-y-4">
                <CheckCircle2 className="w-10 h-10 opacity-20" />
                <p className="italic text-sm">Clean slate! No pending tasks.</p>
              </div>
            ) : (
              tasks.filter(t => !t.completed).slice(0, 6).map((task, idx) => (
                <div key={idx} className="flex items-center gap-4 group">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)] group-hover:scale-125 transition-transform" />
                  <span className="text-sm text-slate-300 font-semibold line-clamp-1 group-hover:text-white transition-colors">{task.task}</span>
                </div>
              ))
            )}
          </div>
          <div className="p-8 pt-0">
             <button onClick={() => navigateTo('tasks')} className="w-full btn-outline justify-between">
                Go to Action Items <ChevronRight className="w-4 h-4" />
             </button>
          </div>
        </section>
      </div>
    </div>
  );
}
