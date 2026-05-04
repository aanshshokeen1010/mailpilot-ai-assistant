import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, Wand2, Trash2, RefreshCw, ChevronRight, User, AlertCircle, Inbox, ShieldCheck, Zap, Layers, BarChart3, Filter, MessageSquare } from 'lucide-react';
import { fetchAPI } from '../api';
import { loadLocalSettings } from '../settingsStorage';
import { saveTasksCache } from '../cacheStorage';

const formatCategoryLabel = (category) => {
  return String(category || 'UNCATEGORIZED')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
};

const isUrgentCategory = (category = '') => {
  return /ACTION|URGENT|REPLY|CLIENT|DEADLINE|LEGAL|APPROVAL/.test(String(category).toUpperCase());
};

const isLowSignalCategory = (category = '') => {
  return /NOISE|NEWSLETTER|RECEIPT|PROMO|MARKETING|UPDATE|ALERT/.test(String(category).toUpperCase());
};

const getCategoryIcon = (category = '') => {
  if (isUrgentCategory(category)) return AlertCircle;
  if (isLowSignalCategory(category)) return Filter;
  return BarChart3;
};

const getCategoryColor = (category = '') => {
  if (isUrgentCategory(category)) return 'text-rose-400';
  if (isLowSignalCategory(category)) return 'text-slate-500';
  return 'text-primary';
};

export default function Emails({ emails, setEmails, setTasks, showToast, onAuthExpired, showReplyModal, setSelectedEmail, autoRefreshMs = 0 }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchingStep, setFetchingStep] = useState('');
  const [progress, setProgress] = useState(0);
  const fetchRef = useRef(null);
  const didAutoFetchRef = useRef(false);
  const shouldAutoFetchOnMount = !emails || emails.length === 0;

  const mergeTasksIntoWorkspace = (incomingTasks = []) => {
    const validTasks = incomingTasks.filter(t => t && t.id);
    if (validTasks.length === 0 || !setTasks) return;

    setTasks(prev => {
      const existingIds = new Set(prev.map(t => String(t.id)));
      const newTasks = validTasks.filter(t => !existingIds.has(String(t.id)));
      const nextTasks = [...newTasks, ...prev];
      saveTasksCache(nextTasks);
      return nextTasks;
    });
  };

  // Auto-sync on first load
  useEffect(() => {
    if (!didAutoFetchRef.current && shouldAutoFetchOnMount) {
      didAutoFetchRef.current = true;
      const timer = setTimeout(() => fetchRef.current?.(), 0);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoFetchOnMount]);

  useEffect(() => {
    if (!autoRefreshMs) return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRef.current?.();
      }
    }, autoRefreshMs);

    return () => clearInterval(timer);
  }, [autoRefreshMs]);

  useEffect(() => {
    fetchRef.current = handleFetch;
  });

  const analyzeBatch = async (email, forceRetry = false) => {
    try {
      const settings = loadLocalSettings();
      const cacheKey = `mailpilot_summary_${email.id}_${settings.ai_detail_level}_${settings.ai_persona.length}`;
      if (forceRetry) {
        localStorage.removeItem(cacheKey);
      }
      if (!forceRetry) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const result = JSON.parse(cached);
          setEmails(prev => prev.map(p =>
            p.id === email.id ? { ...p, ...result, isAnalyzing: false } : p
          ));
          mergeTasksIntoWorkspace(result.tasks || []);
          return;
        }
      }

      const payload = forceRetry ? { ...email, retry: true } : email;
      let result = await fetchAPI('/analyze-single', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          ai_detail_level: settings.ai_detail_level,
          ai_persona: settings.ai_persona
        })
      });

      // Handle Asynchronous Background Analysis (202 Accepted)
      if (result && result.status === 'processing') {
        // Poll for completion
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          try {
            pollCount += 1;
            const status = await fetchAPI(`/analyze/status/${email.id}`);
            if (status.status === 'complete') {
              clearInterval(pollInterval);
              
              const finalResult = status;
              
              // Cache and update state
              localStorage.setItem(cacheKey, JSON.stringify({
                summary: finalResult.summary,
                category: finalResult.category,
                tasks: finalResult.tasks,
                james_note: finalResult.james_note
              }));
              
              mergeTasksIntoWorkspace(finalResult.tasks || []);
              
              setEmails(prev => prev.map(p =>
                p.id === email.id ? { ...p, ...finalResult, isAnalyzing: false } : p
              ));
            } else if (status.status === 'error') {
              clearInterval(pollInterval);
              throw new Error(status.message || 'Background analysis failed');
            } else if (pollCount >= 24) {
              clearInterval(pollInterval);
              throw new Error('Analysis polling timed out');
            }
          } catch (err) {
            clearInterval(pollInterval);
            console.error("Polling error:", err);
            setEmails(prev => prev.map(p =>
              p.id === email.id ? { ...p, summary: 'Linguistic Engine Error.', isAnalyzing: false, category: 'ERR' } : p
            ));
          }
        }, 2500); // Poll every 2.5 seconds
        
        return; // Polling takes over
      }

      if (result && result.engine) {
        setFetchingStep(`Reasoning (${result.engine})...`);
      }

      if (result && !result.error && result.summary) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            summary: result.summary,
            category: result.category,
            tasks: result.tasks,
            james_note: result.james_note
          }));

          // Update global task state if new tasks found
          mergeTasksIntoWorkspace(result.tasks || []);
        } catch {
          console.warn("Storage full.");
        }
      }

      setEmails(prev => prev.map(p =>
        p.id === email.id ? { ...p, ...result, isAnalyzing: false } : p
      ));
    } catch {
      setEmails(prev => prev.map(p =>
        p.id === email.id ? { ...p, summary: 'Linguistic Engine Error.', isAnalyzing: false, category: 'ERR' } : p
      ));
    }
  };

  const triggerResummarize = (email) => {
    setEmails(prev => prev.map(p => p.id === email.id ? { ...p, isAnalyzing: true, summary: 'Re-evaluating neural context...', category: null } : p));
    analyzeBatch(email, true);
    showToast('info', "Bureau's scanning the neural context again, Boss!");
  };

  const parseSummary = (summary) => {
    if (typeof summary !== 'string') return summary;
    try {
      const parsed = JSON.parse(summary);
      return parsed.summary || summary;
    } catch {
      if (summary.startsWith('{') && summary.includes('"summary":')) {
        const match = summary.match(/"summary":\s*"([^"]*)"/);
        return match ? match[1] : summary;
      }
      return summary;
    }
  };

  async function handleFetch() {
    if (isFetching) return;
    setIsFetching(true);
    setProgress(5);
    setFetchingStep('Initiating Bureau Sync...');

    try {
      const rawData = await fetchAPI('/emails-raw');
      if (rawData.needs_auth) {
        showToast('error', 'Session Revoked.');
        onAuthExpired?.();
        setIsFetching(false);
        return;
      }

      const rawEmails = rawData.data || [];
      if (rawEmails.length === 0) {
        showToast('info', 'Bureau has no new intel for you, Boss.');
        setIsFetching(false);
        return;
      }

      const initialEmails = rawEmails.map(e => ({ ...e, summary: 'Bureau is scanning context...', isAnalyzing: true }));
      setEmails(initialEmails);
      setProgress(20);
      setFetchingStep('Initial Intelligence Triage...');

      const CONCURRENCY_LIMIT = 5;
      const pool = new Set();
      let completedCount = 0;

      for (const email of initialEmails) {
        if (pool.size >= CONCURRENCY_LIMIT) {
          await Promise.race(pool);
        }
        const promise = analyzeBatch(email).then(() => {
          completedCount++;
          setProgress(Math.round(20 + (80 * (completedCount / initialEmails.length))));
          pool.delete(promise);
        });
        pool.add(promise);
      }
      await Promise.all(pool);

      setFetchingStep('Intelligence Stabilized, Boss!');
      setProgress(100);
      setTimeout(() => {
        setIsFetching(false);
        setFetchingStep('');
        setProgress(0);
      }, 800);
    } catch {
      showToast('error', "Sorry Boss, Sync Failed. Connection's fuzzy.");
      setIsFetching(false);
    }
  }

  const categoryTabs = useMemo(() => {
    const counts = new Map();
    (emails || []).forEach(email => {
      if (email.isAnalyzing) return;
      const category = email.category || 'UNCATEGORIZED';
      counts.set(category, (counts.get(category) || 0) + 1);
    });

    return [
      { id: 'ALL', label: 'All Intelligence', icon: Layers, count: emails.length, color: 'text-primary' },
      ...Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([category, count]) => ({
          id: category,
          label: formatCategoryLabel(category),
          icon: getCategoryIcon(category),
          count,
          color: getCategoryColor(category)
        }))
    ];
  }, [emails]);

  const selectedTab = categoryTabs.some(tab => tab.id === activeTab) ? activeTab : 'ALL';

  const filteredEmails = useMemo(() => {
    let list = (emails || []).filter(e =>
      (e.subject || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.sender || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (selectedTab !== 'ALL') {
      list = list.filter(e => (e.category || 'UNCATEGORIZED') === selectedTab);
    }

    return list;
  }, [emails, searchTerm, selectedTab]);

  const handleArchive = async (threadId, emailId) => {
    if (!threadId) {
      setEmails(prev => prev.filter(e => e.id !== emailId));
      return;
    }
    try {
      await fetchAPI(`/archive-thread/${threadId}`, { method: 'POST' });
      setEmails(prev => prev.map(e => e.threadId === threadId ? { ...e, archived: true } : e));
      setTimeout(() => {
        setEmails(prev => prev.filter(e => e.id !== emailId));
        showToast('success', 'Thread Secured & Archived, Boss!');
      }, 500);
    } catch {
      showToast('error', 'Sorry Boss, archive operation failed.');
    }
  };

  return (
    <div className="space-y-12 max-w-full mx-auto pb-32">
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-primary mb-2">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Bureau Secured Connection</span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter">The AI <span className="text-gradient">Bureau.</span></h2>
          <p className="text-slate-500 text-lg font-medium">Linguistic analysis and strategic summarization.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/[0.02] border border-white/5 p-2 rounded-[24px] backdrop-blur-xl shadow-2xl">
          <div className="relative group flex-1 sm:min-w-[320px]">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-primary transition-colors" />
            <input
              id="intelligence-search"
              name="intelligence-search"
              type="text"
              placeholder="Search Intelligence..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-transparent text-white placeholder:text-slate-700 focus:outline-none font-bold text-sm"
            />
          </div>

          <button
            onClick={handleFetch}
            disabled={isFetching}
            className="btn-gradient px-10 h-14 min-w-[240px] text-xs font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(139,92,246,0.3)]"
          >
            {isFetching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{progress}% Synced</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Initiate Deep Scan</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Strategic Intelligence Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-[28px] max-w-fit">
        {categoryTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-6 py-3.5 rounded-[22px] text-[10px] font-black uppercase tracking-widest transition-all relative ${
              selectedTab === tab.id ? 'text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {selectedTab === tab.id && (
              <motion.div 
                layoutId="activeTab"
                className="absolute inset-0 bg-primary rounded-[22px] shadow-xl shadow-primary/20"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <div className="relative z-10 flex items-center gap-3">
              <tab.icon className={`w-3.5 h-3.5 ${selectedTab === tab.id ? 'text-white' : tab.color}`} />
              <span>{tab.label}</span>
              <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-md ${selectedTab === tab.id ? 'bg-white/20' : 'bg-white/5'}`}>{tab.count}</span>
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {isFetching && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="premium-card p-8 border-primary/20 bg-primary/5 flex flex-col gap-6"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Layers className="w-6 h-6 text-primary animate-pulse" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Bureau Status</p>
                  <p className="text-white font-bold text-lg">{fetchingStep}</p>
                </div>
              </div>
              <div className="text-right">
                 <p className="text-primary font-black text-2xl tabular-nums">{progress}%</p>
                 <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Linguistic Stabilizing</p>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
               <motion.div 
                 className="h-full bg-primary"
                 initial={{ width: 0 }}
                 animate={{ width: `${progress}%` }}
               />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6">
        {filteredEmails.length === 0 && !isFetching ? (
          <div className="premium-card py-40 text-center flex flex-col items-center justify-center space-y-8">
            <div className="w-32 h-32 bg-white/[0.02] border border-white/5 rounded-[40px] flex items-center justify-center">
              <Inbox className="w-12 h-12 text-slate-800" />
            </div>
            <div className="max-w-sm space-y-3">
              <h3 className="text-2xl font-black text-white">Bureau Section Empty.</h3>
              <p className="text-slate-600 font-medium leading-relaxed">No active communications found in this intelligence tier.</p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredEmails.map((email) => (
              <motion.div
                layout
                key={email.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`premium-card group p-8 flex flex-col lg:flex-row gap-10 items-start relative transition-all duration-500 hover:bg-white/[0.03] ${email.isAnalyzing ? 'border-primary/30' : ''}`}
              >
                {/* Visual Anchor */}
                <div className="flex flex-col items-center gap-4 lg:w-16 flex-shrink-0">
                   <div className={`w-16 h-16 rounded-3xl flex items-center justify-center border transition-all duration-500 ${email.isAnalyzing ? 'bg-primary/20 border-primary animate-pulse' : 'bg-white/5 border-white/5 group-hover:border-primary/50 group-hover:bg-primary/5'}`}>
                      {email.isAnalyzing ? <RefreshCw className="w-7 h-7 text-primary animate-spin" /> : <User className="w-7 h-7 text-slate-500 group-hover:text-primary transition-colors" />}
                   </div>
                   <div className="h-full w-px bg-gradient-to-b from-white/10 to-transparent flex-1" />
                </div>

                <div className="flex-1 min-w-0 space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-2xl font-black text-white group-hover:text-primary transition-all tracking-tight leading-none mb-3">
                        {email.subject || '(No Subject)'}
                      </h4>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        Origin: <span className="text-slate-300">{(email.sender || 'Unknown').split('<')[0].trim()}</span>
                      </p>
                    </div>

                    <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border self-start ${
                      isUrgentCategory(email.category) ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 
                      email.category === 'ERR' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                      isLowSignalCategory(email.category) ? 'bg-slate-500/10 text-slate-500 border-white/5' :
                      'bg-primary/10 text-primary border-primary/20'
                    }`}>
                       {email.isAnalyzing ? 'Analyzing Persona...' : formatCategoryLabel(email.category || 'UNCATEGORIZED')}
                    </div>
                  </div>

                  {/* Intelligence Summary Box */}
                  <div
                    onClick={() => !email.isAnalyzing && setSelectedEmail(email)}
                    className={`relative p-8 rounded-[32px] border border-white/5 transition-all cursor-pointer group/summary ${email.isAnalyzing ? 'bg-white/[0.01]' : 'bg-white/[0.02] hover:bg-white/5 hover:border-primary/20 shadow-2xl'}`}
                  >
                    <div className="absolute -top-3 left-8 px-4 py-1 bg-slate-900 border border-white/10 rounded-full flex items-center gap-2">
                       <Sparkles className="w-3 h-3 text-primary" />
                       <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">AI Linguistic Recap</span>
                    </div>

                    <div className="flex justify-between items-start gap-6">
                      <p className={`text-[17px] leading-relaxed font-semibold flex-1 ${email.isAnalyzing ? 'text-slate-700 italic animate-pulse' : 'text-slate-300 italic'}`}>
                        "{parseSummary(email.summary)}"
                      </p>
                      {!email.isAnalyzing && <ChevronRight className="w-6 h-6 text-slate-700 group-hover/summary:text-primary group-hover/summary:translate-x-2 transition-all mt-1" />}
                    </div>
                  </div>

                  {/* James Dynamic Feedback Zone */}
                  <div className="mt-4">
                    <div className="flex items-start gap-4 px-5 py-4 bg-primary/5 border border-primary/10 rounded-3xl relative group/james">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <MessageSquare className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">James Intern Feedback</p>
                        <p className="text-sm text-slate-300 font-medium italic leading-relaxed">
                          "{email.james_note || (email.tasks?.length > 0 ? `Boss, I've flagged ${email.tasks.length} action items for you here. I'm on standby if you need a draft!` : "Everything looks standard here, boss. I'll keep monitoring for updates.")}"
                        </p>
                        {email.tasks?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {email.tasks.slice(0, 3).map((t, i) => (
                              <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[9px] font-black text-amber-500 uppercase tracking-tight max-w-[200px]">
                                <Zap className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate">{t.task || t}</span>
                              </div>
                            ))}
                            {email.tasks.length > 3 && (
                               <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black text-slate-500 uppercase tracking-tight">
                                 +{email.tasks.length - 3} more
                               </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Column */}
                <div className="flex lg:flex-col gap-3 w-full lg:w-auto lg:border-l border-white/10 lg:pl-10">
                  <button
                    disabled={email.isAnalyzing}
                    onClick={() => showReplyModal(email.summary, email)}
                    className="flex-1 lg:flex-none p-5 rounded-3xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-xl hover:shadow-primary/30 disabled:opacity-20 flex flex-col items-center gap-2 group/btn"
                  >
                    <Wand2 className="w-8 h-8 group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">Compose</span>
                  </button>
                  <button
                    disabled={email.isAnalyzing}
                    onClick={() => triggerResummarize(email)}
                    className="flex-1 lg:flex-none p-5 rounded-3xl bg-white/5 text-slate-500 hover:text-amber-500 hover:bg-amber-500/10 transition-all border border-transparent hover:border-amber-500/20 disabled:opacity-20 flex flex-col items-center gap-2"
                    title="Deep Re-evaluation"
                  >
                    <RefreshCw className={`w-6 h-6 ${email.isAnalyzing ? 'animate-spin' : ''}`} />
                    <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">Re-Scan</span>
                  </button>
                  <button
                    disabled={email.isAnalyzing}
                    onClick={() => handleArchive(email.threadId, email.id)}
                    className="flex-1 lg:flex-none p-5 rounded-3xl bg-white/5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20 disabled:opacity-20 flex flex-col items-center gap-2"
                    title="Archive Strategic Intelligence"
                  >
                    <Trash2 className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">Archive</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
