import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Mail, Sparkles, Loader2, AlertCircle, ThumbsUp, ThumbsDown, Zap, ArrowRight, X, FileSearch, Filter, Shield, Info, PenTool } from 'lucide-react';
import { fetchAPI } from './api';
import { Analytics } from "@vercel/analytics/react";
import { loadLocalSettings, mergeServerSettings, saveLocalSettings } from './settingsStorage';
import { saveTasksCache } from './cacheStorage';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Components
import Dashboard from './components/Dashboard';
import Emails from './components/Emails';
import Tasks from './components/Tasks';
import Compose from './components/Compose';
import Settings from './components/Settings';
import JamesTerminal from './components/JamesTerminal';
import Sidebar from './components/Sidebar';
import SplashScreen from './components/SplashScreen';
import Logo from './components/Logo';
import LinkedContent from './components/LinkedContent';
import ProfessionalInbox from './components/ProfessionalInbox';
import { buildEffectivePersona } from './settingsStorage';
import { trackInteraction } from './reinforcementLearning';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [emails, setEmails] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [userPicture, setUserPicture] = useState(null);
  const [userName, setUserName] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedEmailForRecap, setSelectedEmailForRecap] = useState(null);
  const [deepDive, setDeepDive] = useState(null);
  const [isDeepDiving, setIsDeepDiving] = useState(false);
  
  const [analyzingId, setAnalyzingId] = useState(null);
  const [modalReply, setModalReply] = useState('');
  const [modalEmail, setModalEmail] = useState(null);
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Privacy banner — show once, remember dismissal
  const [showPrivacyBanner, setShowPrivacyBanner] = useState(() => {
    return !localStorage.getItem('mailpilot_privacy_acknowledged');
  });

  // Inbox Mode: 'classic' or 'elegant'
  const [inboxMode, setInboxMode] = useState(() => {
    return localStorage.getItem('mailpilot_inbox_mode') || 'classic';
  });

  useEffect(() => {
    localStorage.setItem('mailpilot_inbox_mode', inboxMode);
  }, [inboxMode]);

  // Bug Fix #9: prevent OAuth race with ref
  const oauthHandled = useRef(false);

  const showToast = (type, message) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else if (type === 'info') toast.info(message);
  };

  const handleAnalyzeSingle = async (email) => {
    if (analyzingId) return;
    setAnalyzingId(email.id);
    try {
      const settings = loadLocalSettings();
      const effectivePersona = buildEffectivePersona(settings);
      
      const result = await fetchAPI('/analyze-single', {
        method: 'POST',
        body: JSON.stringify({
          ...email,
          ai_detail_level: settings.ai_detail_level,
          ai_persona: effectivePersona
        })
      });

      if (result && result.status === 'processing') {
        const pollInterval = setInterval(async () => {
          try {
            const status = await fetchAPI(`/analyze/status/${email.id}`);
            if (status.status === 'complete' || status.summary) {
              clearInterval(pollInterval);
              const finalResult = status.result || status;
              setEmails(prev => prev.map(p => 
                p.id === email.id ? { ...p, ...finalResult, isAnalyzing: false } : p
              ));
              setAnalyzingId(null);
            }
          } catch (err) {
            clearInterval(pollInterval);
            setAnalyzingId(null);
          }
        }, 2000);
      } else {
        setEmails(prev => prev.map(p => 
          p.id === email.id ? { ...p, ...result, isAnalyzing: false } : p
        ));
        setAnalyzingId(null);
        trackInteraction('analysis', 2); // Local RL tracking
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      setAnalyzingId(null);
    }
  };

  const showReplyModal = (summary, email) => {
    setModalEmail(email);
    setIsModalOpen(true);
    setIsGeneratingReply(true);
    setIsSendingReply(false);
    setModalReply('');
    
    (async () => {
      try {
        const settings = loadLocalSettings();
        const data = await fetchAPI('/generate-reply', {
          method: 'POST',
          body: JSON.stringify({
            content: summary || email.snippet,
            tone: settings.ai_tone,
            ai_details: settings.ai_details
          })
        });
        setModalReply(data.reply || '');
      } catch {
        setModalReply('Failed to generate reply. You can type manually.');
      } finally {
        setIsGeneratingReply(false);
      }
    })();
  };

  const handleRecapFeedback = async (email, isPositive) => {
    const feedbackType = isPositive ? 'positive' : 'negative';
    try {
      const response = await fetchAPI('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          id: email.id,
          is_positive: isPositive,
          snippet: email.snippet,
          summary: email.summary
        })
      });

      const action = response.action;
      setEmails(prev => prev.map(p => 
        p.id === email.id ? { ...p, userFeedback: action === 'toggled_off' ? null : feedbackType } : p
      ));
      
      // Update the local modal state too
      setSelectedEmailForRecap(prev => ({ ...prev, userFeedback: action === 'toggled_off' ? null : feedbackType }));

      if (action === 'toggled_off') {
        showToast('info', 'Feedback removed.');
      } else {
        showToast(isPositive ? 'success' : 'warning', isPositive ? 'Saved as Golden Example!' : 'Feedback saved.');
        trackInteraction('feedback', 10); // High-value RL trigger
      }
    } catch {
      showToast('error', 'Failed to save feedback.');
    }
  };

  const normalizeModalCategory = (category = '') => String(category || '').toUpperCase().replace(/[^A-Z0-9_ ]+/g, '').trim().replace(/\s+/g, '_');

  const handleCategoryOverride = async (email, category) => {
    const originalCategory = email.originalCategory || (email.category_override ? 'STRATEGIC_FYI' : email.category) || 'STRATEGIC_FYI';
    const nextCategory = category || originalCategory;
    const patch = {
      category: nextCategory,
      category_override: category || null,
      originalCategory
    };
    setEmails(prev => prev.map(p => p.id === email.id ? { ...p, ...patch } : p));
    setSelectedEmailForRecap(prev => prev ? { ...prev, ...patch } : prev);
    try {
      await fetchAPI('/category-override', {
        method: 'POST',
        body: JSON.stringify({ item_id: email.id, category })
      });
    } catch {
      showToast('info', 'Saved locally. Persistent training will sync when backend is reachable.');
    }
    showToast(category === 'FILTERED_NOISE' ? 'info' : category === 'URGENT_ACTION' ? 'success' : 'info',
      category === 'FILTERED_NOISE' ? 'Marked as noise.' : category === 'URGENT_ACTION' ? 'Marked important.' : 'Manual category override removed.');
  };

  const handleDeepDive = async (email) => {
    setIsDeepDiving(true);
    setDeepDive({ email, analysis: 'Deep-dive analysis is assembling...', attachments: [] });
    try {
      const data = await fetchAPI('/deep-dive', {
        method: 'POST',
        body: JSON.stringify({
          id: email.id,
          threadId: email.threadId,
          subject: email.subject,
          sender: email.sender,
          snippet: email.snippet
        })
      });
      setDeepDive({ email, analysis: data.analysis, attachments: data.attachments || [] });
    } catch (err) {
      setDeepDive({ email, analysis: err.message || 'Deep dive failed.', attachments: [] });
    } finally {
      setIsDeepDiving(false);
    }
  };

  useEffect(() => {
    const bootFailsafe = setTimeout(() => {
      setIsInitializing(false);
    }, 8000);

    // Bug Fix #9: Check for OAuth code FIRST, before health check
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    const initialize = async () => {
      if (code && !oauthHandled.current) {
        oauthHandled.current = true;
        try {
          await fetchAPI('/oauth2callback', {
            method: 'POST',
            body: JSON.stringify({ code, state })
          });
          window.history.replaceState({}, document.title, "/");
          setIsAuthenticated(true);
        } catch (err) {
          console.error("OAuth Exchange Failed:", err);
          setIsAuthenticated(false);
        }
      }

      try {
        const data = await fetchAPI('/health');
        if (data.status === 'ok') {
          setIsAuthenticated(true);
          setUserEmail(data.user_email);
          setUserPicture(data.user_picture);
          setUserName(data.user_name);
          
          // Initial settings sync to local storage
          fetchAPI('/settings').then(settingsData => {
            if (settingsData) {
              const merged = saveLocalSettings(mergeServerSettings(loadLocalSettings(), settingsData));
              // Trigger app-wide re-renders if necessary, though settingsStorage is the source of truth
            }
          }).catch(() => console.warn("Background settings sync failed."));

        } else {
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsInitializing(false);
        clearTimeout(bootFailsafe);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const fetchData = async () => {
        try {
          const [emailData, taskData] = await Promise.all([
            fetchAPI('/emails'),
            fetchAPI('/tasks')
          ]);
          setEmails(emailData.data || []);
          setTasks(taskData.tasks || []);
          saveTasksCache(taskData.tasks || []);
        } catch (err) {
          console.error("Fetch Data Error:", err);
          if (err.message.includes('AuthRequired')) {
            setIsAuthenticated(false);
          }
        }
      };
      fetchData();
      const interval = setInterval(fetchData, 120000); // Poll every 2 mins
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleSendReply = async () => {
    if (!modalEmail || !modalReply.trim()) return;
    setIsSendingReply(true);
    try {
      await fetchAPI('/send-email', {
        method: 'POST',
        body: JSON.stringify({
          to: modalEmail.sender,
          subject: `Re: ${modalEmail.subject}`,
          body: modalReply
        })
      });
      showToast('success', 'Email sent successfully!');
      setIsModalOpen(false);
    } catch {
      showToast('error', 'Failed to send email.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const viewSourceEmail = (messageId) => {
    if (!messageId) return;
    const email = emails.find(e => e.id === messageId || e.threadId === messageId);
    if (email) {
      setSelectedEmailForRecap(email);
    } else {
      showToast('info', 'Finding the original thread...');
      setActiveTab('emails');
    }
  };

  if (isInitializing) return <SplashScreen />;
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.1),transparent_50%)]" />
        <div className="relative premium-card max-w-lg w-full p-12 text-center border-white/5">
           <div className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-primary to-accent mx-auto mb-10 flex items-center justify-center shadow-2xl shadow-primary/20 rotate-3 group hover:rotate-0 transition-transform duration-700">
             <Logo className="w-12 h-12" />
           </div>
           <h1 className="text-5xl font-black text-white tracking-tighter mb-4">MailPilot.</h1>
           <p className="text-slate-500 text-lg font-medium mb-10 leading-relaxed">Intelligence-first email automation for high-stakes workflows.</p>
           <a 
             href={`${fetchAPI('/auth-url')}`}
             onClick={async (e) => {
               e.preventDefault();
               const data = await fetchAPI('/auth-url');
               if (data.auth_url) window.location.href = data.auth_url;
             }}
             className="flex items-center justify-center gap-3 w-full py-5 rounded-3xl bg-white text-slate-950 font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all duration-500 shadow-xl shadow-white/5 active:scale-95"
           >
             Initialize Protocol <ArrowRight className="w-5 h-5" />
           </a>
           <div className="mt-12 pt-10 border-t border-white/5">
              <div className="flex items-center justify-center gap-8">
                 <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">Status</p>
                    <p className="text-xs font-bold text-emerald-400">System Ready</p>
                 </div>
                 <div className="w-px h-8 bg-white/5" />
                 <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">Encrypted</p>
                    <p className="text-xs font-bold text-slate-400">256-Bit SSL</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row font-sans selection:bg-primary/30 text-slate-200 overflow-hidden">
      <ToastContainer theme="dark" position="bottom-right" toastStyle={{ borderRadius: '1.25rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold' }} />
      <JamesTerminal showToast={showToast} />
      
      <Sidebar 
        currentView={activeTab} 
        setView={setActiveTab} 
        userEmail={userEmail} 
        userPicture={userPicture}
        userName={userName}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSessionEnded={() => setIsAuthenticated(false)}
        inboxMode={inboxMode}
        setInboxMode={setInboxMode}
      />

      {showPrivacyBanner && (
        <div className="fixed top-0 inset-x-0 z-[10001] bg-primary/95 backdrop-blur-md px-6 py-4 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <div className="flex items-center gap-3">
             <Shield className="w-5 h-5 text-white animate-pulse" />
             <p className="text-sm font-black text-white uppercase tracking-wider">Privacy Protocol Active: MailPilot does not store original email contents on disk.</p>
          </div>
          <button 
            onClick={() => {
              localStorage.setItem('mailpilot_privacy_acknowledged', 'true');
              setShowPrivacyBanner(false);
            }}
            className="px-6 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Acknowledge
          </button>
        </div>
      )}
      
      <main className="flex-1 overflow-y-auto px-6 md:px-12 py-8 md:py-12 relative scrollbar-hide">
        {/* Mobile Header */}
        <div className="flex lg:hidden items-center justify-between mb-8">
           <div className="flex items-center gap-3">
              <Logo className="w-10 h-10" />
              <h1 className="text-xl font-bold text-white tracking-tighter">MailPilot.</h1>
           </div>
           <button 
             onClick={() => setIsSidebarOpen(true)}
             className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400"
           >
              <Search className="w-5 h-5" />
           </button>
        </div>
        <div className="max-w-full mx-auto pb-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: "circOut" }}
            >
              {activeTab === 'dashboard' && <Dashboard emails={emails} tasks={tasks} navigateTo={setActiveTab} />}
              {activeTab === 'emails' && (
                inboxMode === 'professional' || inboxMode === 'elegant' ? (
                  <ProfessionalInbox 
                    emails={emails} 
                    setEmails={setEmails} 
                    showToast={showToast} 
                    analyzeEmail={handleAnalyzeSingle}
                    analyzingId={analyzingId}
                  />
                ) : (
                  <Emails 
                    emails={emails} 
                    setEmails={setEmails} 
                    tasks={tasks} 
                    setTasks={setTasks} 
                    showToast={showToast} 
                    onAuthExpired={() => setIsAuthenticated(false)} 
                    showReplyModal={showReplyModal} 
                    setSelectedEmail={setSelectedEmailForRecap} 
                    autoRefreshMs={30000} 
                  />
                )
              )}
              {activeTab === 'tasks' && <Tasks tasks={tasks} setTasks={setTasks} showToast={showToast} navigateToEmail={viewSourceEmail} />}
              {activeTab === 'compose' && <Compose showToast={showToast} setTasks={setTasks} />}
              {activeTab === 'settings' && (
                <Settings 
                  showToast={showToast} 
                  userEmail={userEmail} 
                  userName={userName} 
                  setTasks={setTasks} 
                  inboxMode={inboxMode} 
                  setInboxMode={setInboxMode} 
                  onAuthExpired={() => setIsAuthenticated(false)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Recap Modal */}
      <AnimatePresence>
        {selectedEmailForRecap && (
          <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6 overflow-hidden pt-12 md:pt-20">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEmailForRecap(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-2xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="relative w-full max-w-4xl max-h-[85vh] premium-card flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)] border-white/10 overflow-hidden"
            >
              <div className="p-8 border-b border-white/10 bg-gradient-to-r from-primary/10 to-transparent flex justify-between items-center gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-bold text-white truncate max-w-full">{selectedEmailForRecap.subject}</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 break-all [overflow-wrap:anywhere]">{selectedEmailForRecap.sender}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEmailForRecap(null)}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-white/[0.01]">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.2em]">
                      <Sparkles className="w-4 h-4" />
                      <span>AI Summary Recap</span>
                    </div>
                    <p className="text-slate-300 text-lg leading-relaxed italic font-medium">
                      {selectedEmailForRecap.summary || "This thread is awaiting high-level intelligence processing."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Extracted Intelligence</p>
                       <div className="premium-card p-6 bg-white/[0.02] border-white/5 space-y-4">
                          <div className="flex items-center justify-between">
                             <span className="text-xs font-bold text-slate-400">Category</span>
                             <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter bg-primary/20 text-primary border border-primary/20`}>
                               {selectedEmailForRecap.category?.replace('_', ' ') || 'GENERAL'}
                             </span>
                          </div>
                          <div className="flex items-center justify-between">
                             <span className="text-xs font-bold text-slate-400">Impact Score</span>
                             <span className="text-xs font-black text-white">{selectedEmailForRecap.priority}/5</span>
                          </div>
                          <div className="flex items-center justify-between">
                             <span className="text-xs font-bold text-slate-400">Read Status</span>
                             <span className="text-xs font-black text-white">{selectedEmailForRecap.labels?.includes('UNREAD') ? 'Pending' : 'Processed'}</span>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bureau Training</p>
                       <div className="premium-card p-6 bg-white/[0.02] border-white/5">
                          <p className="text-[10px] text-slate-500 mb-4 leading-relaxed italic">"Was this summary accurate? Your feedback trains your neural persona."</p>
                          <div className="flex gap-3">
                             <button 
                               onClick={() => handleRecapFeedback(selectedEmailForRecap, true)}
                               className={`flex-1 py-3 rounded-xl border transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest ${selectedEmailForRecap.userFeedback === 'positive' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-white/5 border-white/10 text-slate-400'}`}
                             >
                               <ThumbsUp className="w-3.5 h-3.5" /> Useful
                             </button>
                             <button 
                               onClick={() => handleRecapFeedback(selectedEmailForRecap, false)}
                               className={`flex-1 py-3 rounded-xl border transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest ${selectedEmailForRecap.userFeedback === 'negative' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)]' : 'bg-white/5 border-white/10 text-slate-400'}`}
                             >
                               <ThumbsDown className="w-3.5 h-3.5" /> Refine
                             </button>
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category Override</p>
                    <div className="flex flex-wrap gap-2">
                       {['URGENT_ACTION', 'CRITICAL_ACTION', 'STRATEGIC_FYI', 'ROUTINE_OPS', 'FILTERED_NOISE'].map(cat => (
                         <button
                           key={cat}
                           onClick={() => handleCategoryOverride(selectedEmailForRecap, selectedEmailForRecap.category_override === cat ? null : cat)}
                           className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${selectedEmailForRecap.category_override === cat ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20'}`}
                         >
                           {cat.replace('_', ' ')}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5 flex gap-4">
                     <button 
                        onClick={() => handleDeepDive(selectedEmailForRecap)}
                        disabled={isDeepDiving}
                        className="flex-1 py-5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-violet-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                     >
                       {isDeepDiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                       Consult Bureau COO
                     </button>
                     <button 
                        onClick={() => {
                          showReplyModal(selectedEmailForRecap.summary, selectedEmailForRecap);
                          setSelectedEmailForRecap(null);
                        }}
                        className="flex-1 py-5 rounded-2xl bg-white text-slate-950 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-white/5 flex items-center justify-center gap-3 active:scale-95 transition-all"
                     >
                       <PenTool className="w-4 h-4" />
                       Draft Executive Response
                     </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reply Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="premium-card w-full max-w-3xl max-h-[90vh] flex flex-col border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-accent/5 to-transparent">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent border border-accent/20">
                     <PenTool className="w-6 h-6" />
                   </div>
                   <div>
                     <h3 className="text-xl font-black text-white tracking-tight">AI Executive Writer</h3>
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Drafting for: {modalEmail?.sender}</p>
                   </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 rounded-xl bg-white/5 text-slate-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 bg-white/[0.01]">
                {isGeneratingReply ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-6">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-lg font-bold text-white animate-pulse">James is drafting your response...</p>
                    <p className="text-xs text-slate-500 uppercase tracking-[0.2em]">Analyzing neural persona & tone</p>
                  </div>
                ) : (
                  <textarea 
                    value={modalReply}
                    onChange={(e) => setModalReply(e.target.value)}
                    className="w-full h-[400px] bg-transparent border-none text-slate-200 focus:ring-0 text-lg leading-relaxed font-medium resize-none custom-scrollbar"
                    placeholder="Refine James' draft here..."
                  />
                )}
              </div>
              <div className="p-8 border-t border-white/10 flex gap-4 bg-slate-900/50">
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-8 py-5 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSendReply}
                  disabled={isSendingReply || !modalReply.trim()}
                  className="flex-1 py-5 rounded-2xl btn-gradient text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isSendingReply ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  Deploy Response
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deep Dive Modal */}
      <AnimatePresence>
        {deepDive && (
          <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 sm:p-6 bg-black/95 backdrop-blur-2xl">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="premium-card w-full max-w-4xl max-h-[90vh] flex flex-col border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-10 border-b border-white/10 flex justify-between items-start bg-gradient-to-r from-primary/5 to-transparent">
                 <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/10">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-2">Deep Intelligence Briefing</p>
                      <h3 className="text-3xl font-black text-white tracking-tighter">{deepDive.email.subject}</h3>
                    </div>
                 </div>
                 <button onClick={() => setDeepDive(null)} className="p-4 rounded-2xl bg-white/5 text-slate-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-10">
                 <div className="space-y-6">
                   <div className="flex items-center gap-3 text-primary text-[10px] font-black uppercase tracking-widest">
                     <Info className="w-4 h-4" />
                     <span>Executive Summary</span>
                   </div>
                   <div className="prose prose-invert max-w-none">
                     {deepDive.analysis.split('\n').map((line, i) => (
                       <p key={i} className="text-slate-200 text-xl leading-relaxed font-medium mb-4">{line}</p>
                     ))}
                   </div>
                 </div>
              </div>
              <div className="p-10 border-t border-white/10 bg-slate-900/50 flex justify-between items-center">
                 <div className="flex items-center gap-6 text-slate-500">
                    <div className="flex flex-col">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Intelligence Depth</span>
                       <span className="text-xs font-bold text-slate-400">Tactical + Strategic</span>
                    </div>
                 </div>
                 <button 
                   onClick={() => setDeepDive(null)}
                   className="px-10 py-5 rounded-2xl bg-white text-slate-950 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-white/5 active:scale-95 transition-all"
                 >
                   Briefing Acknowledged
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <Analytics />
    </div>
  );
}
