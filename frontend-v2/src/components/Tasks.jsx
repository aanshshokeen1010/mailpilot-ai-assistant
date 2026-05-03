import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Trash2, ListTodo, RefreshCw, Calendar, Loader2, ThumbsUp, ThumbsDown, AlertCircle, TrendingUp, Zap } from 'lucide-react';
import { fetchAPI } from '../api';

export default function Tasks({ tasks, setTasks, showToast, navigateToEmail }) {
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sortBy, setSortBy] = useState('priority'); // 'priority' or 'newest'
  const [filterPriority] = useState('all'); // 'all', 2, 3, 4, 5

  // Auto-sync on first load if we don't already have tasks from the session bridge
  useEffect(() => {
    const initTasks = async () => {
      // Fallback to local cache to survive Vercel instance cold-starts
      const cached = localStorage.getItem('mailpilot_tasks_cache');
      let currentTasks = tasks;
      
      if (cached && (!tasks || tasks.length === 0)) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.length > 0) {
            setTasks(parsed);
            currentTasks = parsed;
          }
        } catch {
          console.warn("Unable to restore cached tasks.");
        }
      }
      
      // Only fetch from server if we are truly empty or need a fresh sync
      if (!currentTasks || currentTasks.length === 0) {
        handleFetchTasks();
      }
    };
    
    initTasks();
  }, []);

  async function handleFetchTasks() {
    setLoading(true);
    try {
      const data = await fetchAPI('/tasks');
      const nextTasks = data.tasks || [];
      setTasks(nextTasks);
      localStorage.setItem('mailpilot_tasks_cache', JSON.stringify(nextTasks));
    } catch {
      showToast('error', "Sorry Boss, Workspace Sync hit a snag.");
    } finally {
      setLoading(false);
    }
  }

  const handleComplete = async (id) => {
    try {
      await fetchAPI(`/complete-task/${id}`, { method: 'PUT' });
      setTasks(prev => {
        const nextTasks = prev.map(t => t.id === id ? { ...t, completed: true } : t);
        localStorage.setItem('mailpilot_tasks_cache', JSON.stringify(nextTasks));
        return nextTasks;
      });
      showToast('success', 'Got it, Boss! Task secured.');
    } catch {
      showToast('error', 'Sorry Boss, update failed.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetchAPI(`/delete-task/${id}`, { method: 'DELETE' });
      setTasks(prev => {
        const nextTasks = prev.filter(t => t.id !== id);
        localStorage.setItem('mailpilot_tasks_cache', JSON.stringify(nextTasks));
        return nextTasks;
      });
      showToast('info', 'Task expunged, Boss!');
    } catch {
      showToast('error', "Couldn't clear that one, Boss.");
    }
  };

  const handleFeedback = async (task, isPositive) => {
    const feedbackType = isPositive ? 'positive' : 'negative';
    try {
      const response = await fetchAPI('/task-feedback', {
        method: 'POST',
        body: JSON.stringify({
          is_positive: isPositive,
          task_text: task.task,
          item_id: String(task.id)
        })
      });

      const action = response.action;

      setTasks(prev => {
        const nextTasks = prev.map(t => 
          t.id === task.id ? { ...t, userFeedback: action === 'toggled_off' ? null : feedbackType } : t
        );
        localStorage.setItem('mailpilot_tasks_cache', JSON.stringify(nextTasks));
        return nextTasks;
      });

      if (action === 'toggled_off') {
        showToast('info', "Training reset, Boss! I've cleared the feedback.");
      } else {
        if (isPositive) {
          showToast('success', "Got it, Boss! I'll double down on intel like this.");
        } else {
          showToast('warning', "Message received, Boss. I've expunged that style from the Bureau.");
          handleDelete(task.id);
        }
      }
    } catch {
      showToast('error', "Sorry Boss, training link unstable.");
    }
  };

  const [consultingTaskId, setConsultingTaskId] = useState(null);
  const [boardroomBriefing, setBoardroomBriefing] = useState(null);
  const [showBoardroom, setShowBoardroom] = useState(false);

  const handleConsultCOO = async (task) => {
    setConsultingTaskId(task.id);
    showToast('info', 'Escalating to COO (340B)...');
    try {
      const data = await fetchAPI('/coo/consult-task', {
        method: 'POST',
        body: JSON.stringify({ task_id: task.id })
      });
      if (data.roadmap) {
        setBoardroomBriefing({ task: task.task, roadmap: data.roadmap });
        setShowBoardroom(true);
      } else if (data.error) {
        showToast('error', data.error);
      }
    } catch {
      showToast('error', "Boss, the COO is in a deep strategy session. This may take up to 30 seconds. Please try again.");
    } finally {
      setConsultingTaskId(null);
    }
  };

  const sortedTasks = [...tasks]
    .filter(t => filterPriority === 'all' || String(t.priority) === String(filterPriority))
    .sort((a, b) => {
      if (sortBy === 'priority') {
        return (b.priority || 0) - (a.priority || 0);
      }
      return b.id - a.id;
    });

  const getPriorityInfo = (p) => {
    if (p >= 5) return { label: 'CRITICAL', color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
    if (p >= 4) return { label: 'HIGH', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    if (p >= 3) return { label: 'MEDIUM', color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' };
    return { label: 'LOW', color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };
  };

  return (
    <div className="space-y-10 max-w-full mx-auto pb-32">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-extrabold text-white tracking-tight">Action <span className="text-gradient">Items.</span></h2>
          <p className="text-slate-400 mt-2 text-lg font-medium">Prioritized intelligence extracted from your network.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 mr-4">
             <button 
               onClick={() => setSortBy('priority')}
               className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === 'priority' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
             >
                By Priority
             </button>
             <button 
               onClick={() => setSortBy('newest')}
               className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === 'newest' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
             >
                By Date
             </button>
          </div>
          <button onClick={handleFetchTasks} disabled={loading} className="btn-gradient px-8 h-12 text-xs font-black uppercase tracking-[0.2em]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Resync Bureau
          </button>
        </div>
      </header>

      <div className="premium-card p-6 min-h-[500px]">
        {sortedTasks.length === 0 ? (
          <div className="h-[400px] flex flex-col items-center justify-center text-center p-12">
            <div className="w-24 h-24 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-8">
              <Zap className="w-10 h-10 text-slate-800" />
            </div>
            <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-xs">Workspace Optimized</p>
            <p className="text-slate-600 text-sm mt-4 font-medium max-w-xs">Your intelligence queue is clear. No actionable items identified in active threads.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <AnimatePresence mode="popLayout">
              {sortedTasks.map((task) => {
                const prio = getPriorityInfo(task.priority);
                const isEscalating = consultingTaskId === task.id;
                
                return (
                  <motion.div 
                    layout
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`flex items-center gap-6 p-6 rounded-3xl transition-all duration-500 group border relative overflow-hidden ${task.completed ? 'opacity-30 grayscale' : 'hover:bg-white/[0.03] bg-white/[0.01] border-white/5 hover:border-white/10'}`}
                  >
                    {/* Completion Check */}
                    <button 
                      onClick={() => !task.completed && handleComplete(task.id)}
                      className={`w-8 h-8 flex-shrink-0 transition-all rounded-xl border-2 flex items-center justify-center ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-700 text-transparent hover:border-emerald-500/50 hover:bg-emerald-500/5'}`}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Priority Badge */}
                        <div className={`px-2.5 py-1 rounded-lg border ${prio.bg} ${prio.border} ${prio.color} text-[9px] font-black tracking-[0.2em] uppercase`}>
                           {prio.label}
                        </div>
                        {task.deadline && (
                           <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                             <Calendar className="w-3 h-3" /> {task.deadline}
                           </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col">
                        <p className={`text-[15px] font-bold text-slate-200 leading-snug tracking-tight ${task.completed ? 'line-through text-slate-500' : ''}`}>
                          {task.task}
                        </p>
                        {task.message_id && (
                           <button 
                            onClick={() => navigateToEmail(task.message_id)}
                            className="mt-2 text-[9px] font-black text-primary uppercase tracking-widest hover:underline text-left w-fit"
                           >
                             View Source Email
                           </button>
                        )}
                      </div>
                    </div>

                    {/* Feedback & Actions */}
                    <div className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2">
                       {/* Consult COO Button */}
                       <button 
                         onClick={() => handleConsultCOO(task)}
                         disabled={isEscalating}
                         className={`flex items-center gap-2 px-4 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-all text-[10px] font-black uppercase tracking-widest ${isEscalating ? 'animate-pulse cursor-wait' : ''}`}
                       >
                          {isEscalating ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3 text-indigo-400" />}
                          Consult COO
                       </button>

                       <div className="h-8 w-px bg-white/10 mx-2" />
                       <button 
                         onClick={() => handleFeedback(task, true)}
                         className={`p-3 rounded-xl transition-all ${task.userFeedback === 'positive' ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                         title="Golden Task Style"
                       >
                          <ThumbsUp className="w-4 h-4" />
                       </button>
                       <button 
                         onClick={() => handleFeedback(task, false)}
                         className="p-3 rounded-xl bg-white/5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                         title="Reject & Delete"
                       >
                          <ThumbsDown className="w-4 h-4" />
                       </button>
                       <button 
                         onClick={() => handleDelete(task.id)}
                         className="p-3 rounded-xl bg-white/5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all ml-2"
                       >
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>

                    {/* Progress Background */}
                    {!task.completed && task.priority >= 4 && (
                       <div className="absolute top-0 right-0 bottom-0 w-1 bg-amber-500/30" />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <footer className="flex flex-col sm:flex-row items-center justify-between gap-6 p-8 bg-white/5 rounded-3xl border border-white/5">
         <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
               <TrendingUp className="w-5 h-5" />
            </div>
            <div>
               <h4 className="text-sm font-black text-white uppercase tracking-widest">Intelligence Metrics</h4>
               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{tasks.filter(t => !t.completed).length} pending items | {tasks.filter(t => t.completed).length} secured</p>
            </div>
         </div>
         <button
            onClick={() => setConfirmClear(true)}
            className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 hover:text-rose-500 transition-colors"
         >
            Purge Workspace
         </button>
      </footer>

      {/* Boardroom Briefing Modal */}
      <AnimatePresence>
         {showBoardroom && boardroomBriefing && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 backdrop-blur-xl bg-black/60">
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95, y: 20 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.95, y: 20 }}
                 className="premium-card p-0 max-w-2xl w-full shadow-[0_0_100px_rgba(99,102,241,0.2)] border-indigo-500/30 overflow-hidden"
               >
                  <div className="bg-indigo-500/10 p-8 border-b border-white/10 flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                           <ListTodo className="w-6 h-6" />
                        </div>
                        <div>
                           <h3 className="text-xl font-black text-white tracking-tight uppercase">Boardroom Briefing</h3>
                           <p className="text-[10px] text-indigo-400 font-black tracking-[0.2em] uppercase">Strategic Operational Roadmap</p>
                        </div>
                     </div>
                     <button onClick={() => setShowBoardroom(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 transition-all">
                        <Trash2 className="w-5 h-5" />
                     </button>
                  </div>
                  
                  <div className="p-10 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                     <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Objective</p>
                        <h4 className="text-2xl font-bold text-white leading-tight">{boardroomBriefing.task}</h4>
                     </div>
                     
                     <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                     
                     <div className="prose prose-invert max-w-none prose-sm">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6">COO Operational Strategy</p>
                        <div className="text-slate-300 whitespace-pre-wrap leading-relaxed font-medium">
                           {boardroomBriefing.roadmap}
                        </div>
                     </div>
                  </div>

                  <div className="bg-white/[0.02] p-6 border-t border-white/5 flex justify-end">
                     <button onClick={() => setShowBoardroom(false)} className="btn-gradient px-10 h-14 text-xs font-black uppercase tracking-widest">Acknowledge Plan</button>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
         {confirmClear && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/40">
               <motion.div 
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 className="premium-card p-12 max-w-md w-full text-center space-y-8 shadow-2xl"
               >
                  <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
                     <AlertCircle className="w-10 h-10" />
                  </div>
                  <div>
                     <h3 className="text-2xl font-black text-white">Purge Workspace?</h3>
                     <p className="text-slate-400 mt-4 font-medium">This will permanently expunge all {tasks.length} action items from the Bureau. This action cannot be reversed.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4">
                     <button onClick={() => setConfirmClear(false)} className="btn-outline h-14 justify-center font-black uppercase tracking-widest text-xs">Cancel</button>
                     <button onClick={async () => {
                        await fetchAPI('/tasks/clear', { method: 'DELETE' });
                        setTasks([]);
                        localStorage.removeItem('mailpilot_tasks_cache');
                        setConfirmClear(false);
                        showToast('success', 'Workspace Purged, Boss! Clean slate secured.');
                     }} className="bg-rose-500 hover:bg-rose-600 text-white rounded-2xl h-14 flex items-center justify-center font-black uppercase tracking-widest text-xs shadow-lg shadow-rose-500/20 transition-all">Expunge All</button>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>
    </div>
  );
}
