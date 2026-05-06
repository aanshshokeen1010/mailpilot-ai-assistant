import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Mail, Sparkles, Loader2, AlertCircle, ThumbsUp, ThumbsDown, Zap, ArrowRight, X, FileSearch, Filter, Shield, Info } from 'lucide-react';
import { fetchAPI } from './api';
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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [emails, setEmails] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [, setMessagesTotal] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [userPicture, setUserPicture] = useState(null);
  const [userName, setUserName] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedEmailForRecap, setSelectedEmailForRecap] = useState(null);
  const [deepDive, setDeepDive] = useState(null);
  const [isDeepDiving, setIsDeepDiving] = useState(false);
  
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
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      setAnalyzingId(null);
    }
  };
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

  const [analyzingId, setAnalyzingId] = useState(null);

  // Bug Fix #9: prevent OAuth race with ref
  const oauthHandled = useRef(false);

  const showToast = (type, message) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else if (type === 'info') toast.info(message);
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
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && !oauthHandled.current) {
      oauthHandled.current = true;
      handleOAuthCallback(code, state);
      return; // Don't run init() — OAuth callback will set auth state
    }

    const init = async () => {
      try {
        const auth = await checkAuth();
        if (auth) {
          setIsInitializing(false);
          syncData().catch(err => {
            console.error("Background data sync failed:", err);
          });
        }
      } catch (err) {
        console.error("Initialization error:", err);
        setIsAuthenticated(false);
      } finally {
        setIsInitializing(false);
        clearTimeout(bootFailsafe);
      }
    };
    
    init();
    return () => clearTimeout(bootFailsafe);
  // OAuth bootstrap must run once on page load so the callback is not replayed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncData() {
    try {
      const [taskData, settingsData, userData] = await Promise.all([
        fetchAPI('/tasks'),
        fetchAPI('/settings'),
        fetchAPI('/user-info').catch(() => ({}))
      ]);
      
      setTasks(taskData.tasks || []);
      saveTasksCache(taskData.tasks || []);
      if (userData.email) setUserEmail(userData.email);
      if (userData.messages_total) setMessagesTotal(userData.messages_total);
      if (userData.picture) setUserPicture(userData.picture);
      if (userData.name) setUserName(userData.name);
      
      // Apply saved accent color
      const settings = saveLocalSettings(mergeServerSettings(loadLocalSettings(), settingsData));

      if (settings.accent_color) {
        const color = settings.accent_color;
        document.documentElement.style.setProperty('--accent-primary', color);
        
        // Generate a complementary secondary color for gradients
        const secondaryMap = {
          '#8b5cf6': '#06b6d4', // Violet -> Cyan
          '#06b6d4': '#10b981', // Cyan -> Emerald
          '#f43f5e': '#fbbf24', // Rose -> Amber
          '#10b981': '#3b82f6'  // Emerald -> Blue
        };
        document.documentElement.style.setProperty('--accent-secondary', secondaryMap[color] || '#06b6d4');
        
        // Convert hex to RGB for shadow effects
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        document.documentElement.style.setProperty('--accent-primary-rgb', `${r}, ${g}, ${b}`);
      }
    } catch (err) {
      console.error("Initial data sync failed:", err);
    }
  }

  async function checkAuth() {
    try {
      const data = await fetchAPI('/health');
      setIsAuthenticated(data.authenticated);
      return data.authenticated;
    } catch {
      setIsAuthenticated(false);
      return false;
    }
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      document.documentElement.style.setProperty('--mouse-x', `${clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${clientY}px`);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const viewSourceEmail = async (messageId) => {
    if (!messageId) {
      showToast('info', "Boss, this task was manually generated or its source is untraceable.");
      return;
    }
    
    let email = emails.find(e => e.id === messageId);
    
    // If email is not in the active state, try to fetch it or switch tabs and hope the mount-fetch finds it
    if (!email) {
      showToast('info', "Locating source communication in the Bureau archives...");
      setActiveTab('emails');
      
      // Give the Emails component a moment to mount and potentially fetch
      setTimeout(() => {
        const found = emails.find(e => e.id === messageId);
        if (found) {
          setSelectedEmailForRecap(found);
        } else {
          showToast('info', "The source email is currently outside the active scan window. Try refreshing the inbox.");
        }
      }, 1000);
    } else {
      setActiveTab('emails');
      setSelectedEmailForRecap(email);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      // PERFORMANCE OPTIMIZATION: Stop polling if tab is inactive to save Vercel CPU time
      if (document.visibilityState !== 'visible') return;

      try {
        const data = await fetchAPI('/user-info');
        if (data && data.messages_total) {
          setMessagesTotal(prev => {
            // If we have a previous count and the new count is higher, notify!
            if (prev !== null && data.messages_total > prev) {
              showToast('info', '📥 Found new mail for you, Boss! Syncing the dashboard...');
            }
            return data.messages_total;
          });
        }
      } catch {
        console.warn("Mail polling paused.");
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function handleOAuthCallback(code, state) {
    window.history.replaceState({}, document.title, "/");
    showToast('info', 'Synchronizing with Google...');
    try {
      const code_verifier = sessionStorage.getItem('mailpilot_verifier');
      await fetchAPI('/oauth2callback', {
        method: 'POST',
        body: JSON.stringify({ code, state, code_verifier })
      });
      sessionStorage.removeItem('mailpilot_verifier');
      showToast('success', "We're in, Boss! Connection Secure. 🚀");
      setIsAuthenticated(true);
      setIsInitializing(false);
      syncData().catch(err => {
        console.error("Post-auth data sync failed:", err);
      });
    } catch (err) {
      showToast('error', err.message || 'Authentication failed.');
      setIsAuthenticated(false);
    } finally {
      setIsInitializing(false);
    }
  }

  const [isRedirecting, setIsRedirecting] = useState(false);

  // --- Login Screen ---
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <SplashScreen isReady={!isInitializing} />
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[150px] rounded-full animate-float" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-accent/10 blur-[150px] rounded-full animate-float" style={{ animationDelay: '2s' }} />
        </div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full premium-card p-12 text-center space-y-10 relative z-10 border-white/10"
        >
          <div className="flex justify-center">
            <Logo className="w-24 h-24" />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">MailPilot<span className="text-primary italic">.</span></h1>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Encrypted Session
            </div>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">To maintain end-to-end security, please authenticate with your Google Workspace account.</p>
          </div>

          <button 
            disabled={isRedirecting}
            onClick={async () => {
              setIsRedirecting(true);
              try {
                const data = await fetchAPI('/auth-url');
                if (data.auth_url) {
                  sessionStorage.setItem('mailpilot_verifier', data.code_verifier || '');
                  window.location.href = data.auth_url;
                } else {
                  throw new Error("No auth URL received");
                }
              } catch (e) {
                showToast('error', e.message || 'Authentication setup failed.');
                setIsRedirecting(false);
              }
            }}
            className="w-full btn-gradient py-5 justify-center text-lg uppercase tracking-widest font-black group disabled:opacity-50"
          >
            {isRedirecting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Zap className="w-5 h-5 group-hover:scale-125 transition-transform" /> 
                <span>Initialize</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
              </>
            )}
          </button>
          
          <div className="pt-6 border-t border-white/5 flex flex-col items-center gap-4">
             <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Powered by NVIDIA NeMo</span>
          </div>
        </motion.div>
        <ToastContainer position="bottom-right" theme="dark" />
      </div>
    );
  }

  // --- Main App ---
  return (
    <div className="flex h-screen bg-[#030303] text-slate-200 selection:bg-primary/30 overflow-hidden">
      <SplashScreen isReady={!isInitializing} />
      <Sidebar 
        userEmail={userEmail} 
        userPicture={userPicture} 
        userName={userName} 
        currentView={activeTab} 
        setView={setActiveTab} 
        showToast={showToast} 
        onSessionEnded={() => setIsAuthenticated(false)}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        inboxMode={inboxMode}
        setInboxMode={setInboxMode}
      />
      {activeTab !== 'emails' && (
        <div className="hidden">
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
        <div className="max-w-full mx-auto pb-12">
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
                inboxMode === 'elegant' ? (
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
              {activeTab === 'settings' && <Settings showToast={showToast} userEmail={userEmail} userName={userName} setTasks={setTasks} inboxMode={inboxMode} setInboxMode={setInboxMode} />}
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
                      "{selectedEmailForRecap.summary}"
                    </p>
                  </div>
                  
                  <div className="h-px bg-white/5 w-full" />
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                      <AlertCircle className="w-4 h-4" />
                      <span>Original Communication</span>
                    </div>
                    <LinkedContent
                      text={selectedEmailForRecap.snippet}
                      className="text-slate-400 leading-relaxed font-medium bg-white/[0.02] p-8 rounded-3xl border border-white/5 text-sm"
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-8 border-t border-white/10 bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleRecapFeedback(selectedEmailForRecap, true)}
                    className={`p-4 rounded-2xl transition-all border ${selectedEmailForRecap.userFeedback === 'positive' 
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                      : 'bg-white/5 text-slate-400 border-transparent hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                  >
                    <ThumbsUp className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => handleRecapFeedback(selectedEmailForRecap, false)}
                    className={`p-4 rounded-2xl transition-all border ${selectedEmailForRecap.userFeedback === 'negative' 
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' 
                      : 'bg-white/5 text-slate-400 border-transparent hover:text-rose-400 hover:bg-rose-500/10'}`}
                  >
                    <ThumbsDown className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => handleDeepDive(selectedEmailForRecap)}
                    className="p-4 rounded-2xl transition-all border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500 hover:text-white"
                    title="Deep Dive"
                  >
                    <FileSearch className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => handleCategoryOverride(selectedEmailForRecap, normalizeModalCategory(selectedEmailForRecap.category) === 'FILTERED_NOISE' ? null : 'FILTERED_NOISE')}
                    className={`px-4 h-14 rounded-2xl transition-all border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                      normalizeModalCategory(selectedEmailForRecap.category) === 'FILTERED_NOISE'
                        ? 'bg-slate-500/20 text-slate-200 border-slate-500/30'
                        : 'bg-white/5 text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    {normalizeModalCategory(selectedEmailForRecap.category) === 'FILTERED_NOISE' ? 'Unmark Noise' : 'Mark Noise'}
                  </button>
                  <button
                    onClick={() => handleCategoryOverride(selectedEmailForRecap, normalizeModalCategory(selectedEmailForRecap.category) === 'URGENT_ACTION' && selectedEmailForRecap.category_override ? null : 'URGENT_ACTION')}
                    className={`px-4 h-14 rounded-2xl transition-all border text-[10px] font-black uppercase tracking-widest ${
                      normalizeModalCategory(selectedEmailForRecap.category) === 'URGENT_ACTION' && selectedEmailForRecap.category_override
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500 hover:text-white'
                    }`}
                  >
                    {normalizeModalCategory(selectedEmailForRecap.category) === 'URGENT_ACTION' && selectedEmailForRecap.category_override ? 'Remove Important' : 'Important'}
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <button onClick={() => setSelectedEmailForRecap(null)} className="btn-outline px-8 py-4">Close</button>
                  <button 
                    onClick={() => {
                      const e = selectedEmailForRecap;
                      setSelectedEmailForRecap(null);
                      showReplyModal(e.summary, e);
                    }}
                    className="btn-gradient px-8 py-4"
                  >
                    Draft Reply
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deepDive && (
          <div className="fixed inset-0 z-[10002] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              className="premium-card w-full max-w-4xl max-h-[85vh] overflow-hidden border-cyan-500/20"
            >
              <div className="p-8 border-b border-white/10 flex items-center justify-between bg-cyan-500/10">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-400">Deep-Dive Intelligence</p>
                  <h3 className="text-2xl font-black text-white truncate mt-2">{deepDive.email.subject || '(No Subject)'}</h3>
                </div>
                <button onClick={() => setDeepDive(null)} className="p-3 rounded-xl bg-white/5 text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8 overflow-y-auto max-h-[calc(85vh-150px)] custom-scrollbar space-y-8">
                {deepDive.attachments.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Attachments Detected</p>
                    <div className="flex flex-wrap gap-2">
                      {deepDive.attachments.map((a, i) => (
                        <span key={i} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300">
                          {a.filename}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <LinkedContent
                  text={deepDive.analysis}
                  className={`leading-relaxed text-slate-300 font-medium ${isDeepDiving ? 'animate-pulse text-slate-500' : ''}`}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reply Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl" onClick={() => setIsModalOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="premium-card w-full max-w-3xl overflow-hidden border-white/20"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-primary/20 to-transparent">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                      <Sparkles className="w-5 h-5 text-white" />
                   </div>
                   <h3 className="text-2xl font-bold text-white">AI Drafting Assistant</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-10 space-y-8">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recipient Address</span>
                  <span className="text-sm font-bold text-primary break-all text-right [overflow-wrap:anywhere]">
                    {modalEmail?.sender?.match(/<(.+)>/)?.[1] || modalEmail?.sender || 'Unknown'}
                  </span>
                </div>
                {isGeneratingReply ? (
                  <div className="w-full h-80 bg-white/[0.02] border border-white/10 rounded-3xl flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">Drafting intelligent response...</span>
                    </div>
                  </div>
                ) : (
                  <textarea 
                    value={modalReply} 
                    onChange={(e) => setModalReply(e.target.value)} 
                    className="w-full h-80 bg-white/[0.02] border border-white/10 rounded-3xl p-8 text-slate-200 focus:outline-none focus:border-primary/50 transition-all leading-relaxed text-lg" 
                  />
                )}
                <button 
                  disabled={isGeneratingReply || isSendingReply || !modalReply.trim()}
                  onClick={async () => {
                    if (isSendingReply) return;
                    setIsSendingReply(true);
                    showToast('info', 'Dispatching secure response...');
                    try {
                      await fetchAPI('/send-email', { 
                        method: 'POST', 
                        body: JSON.stringify({ 
                          to: modalEmail?.sender?.match(/<(.+)>/)?.[1] || modalEmail?.sender, 
                          subject: modalEmail?.subject ? `Re: ${modalEmail.subject.replace(/^Re:\s*/i, '')}` : 'Reply',
                          body: modalReply 
                        }) 
                      });
                      setIsModalOpen(false);
                      showToast('success', 'Message delivered, Boss. Good luck with that one!');
                    } catch {
                      showToast('error', "Sorry Boss, couldn't get that message through.");
                    } finally {
                      setIsSendingReply(false);
                    }
                  }} 
                  className="w-full btn-gradient py-5 text-lg font-black uppercase tracking-widest disabled:opacity-50"
                >
                   {isSendingReply ? 'Sending...' : 'Confirm & Send'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Privacy & Security Reminder Banner */}
      <AnimatePresence>
        {showPrivacyBanner && isAuthenticated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10010] flex items-center justify-center p-4 sm:p-8 bg-black/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ duration: 0.5, ease: "backOut" }}
              className="premium-card max-w-2xl w-full overflow-hidden border-emerald-500/20 shadow-[0_0_120px_rgba(16,185,129,0.08)]"
            >
              {/* Header */}
              <div className="p-8 sm:p-10 border-b border-white/10 bg-gradient-to-r from-emerald-500/10 via-transparent to-cyan-500/5 flex items-start justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">Just a Reminder</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">Your Privacy is Sacred</h3>
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('mailpilot_privacy_acknowledged', 'true');
                    setShowPrivacyBanner(false);
                  }}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-8 sm:p-10 space-y-8">
                <div className="space-y-6">
                  <div className="flex items-start gap-4 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                    <Info className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-widest mb-2">You can only see YOUR emails</h4>
                      <p className="text-sm text-slate-400 leading-relaxed font-medium">
                        MailPilot connects exclusively to <strong className="text-white">your own Google account</strong> via OAuth 2.0. 
                        It is technically impossible for this app to access, view, or read any other person's emails. 
                        Each session is isolated to the authenticated user's mailbox only.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                      <div className="flex items-center gap-2 text-cyan-400">
                        <Shield className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Zero Cross-Access</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        No user can see another user's data. OAuth tokens are session-scoped and never shared.
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                      <div className="flex items-center gap-2 text-violet-400">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">AI Stays Local</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        AI analysis runs per-session. Your email content is not stored permanently or used to train models.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    localStorage.setItem('mailpilot_privacy_acknowledged', 'true');
                    setShowPrivacyBanner(false);
                  }}
                  className="w-full btn-gradient h-16 rounded-2xl text-sm font-black uppercase tracking-[0.2em] justify-center shadow-2xl shadow-emerald-500/20"
                  style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}
                >
                  <Shield className="w-5 h-5" />
                  I Understand — Continue to Dashboard
                </button>

                <p className="text-center text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                  This notice appears once. You can review our security details anytime in Preferences.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ToastContainer position="bottom-right" theme="dark" hideProgressBar />
      <JamesTerminal showToast={showToast} />
    </div>
  );
}
