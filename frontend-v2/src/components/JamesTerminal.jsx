import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Terminal, ChevronDown, Sparkles, Command } from 'lucide-react';
import { fetchAPI } from '../api';

export default function JamesTerminal({ showToast }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState(() => {
    const saved = localStorage.getItem('mailpilot_james_chat');
    return saved ? JSON.parse(saved) : [
      { role: 'james', content: "Morning, Boss! James here. I've been scanning the network - strategic context is looking solid. Anything you need deep-dived or drafted?" }
    ];
  });
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('mailpilot_james_chat', JSON.stringify(chat));
  }, [chat]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat, loading]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
        setTimeout(() => document.getElementById('james-command-input')?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!message.trim() || loading) return;

    const userMsg = message;
    setMessage('');
    setChat(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const data = await fetchAPI('/chat-with-james', {
        method: 'POST',
        body: JSON.stringify({ message: userMsg })
      });
      setChat(prev => [...prev, { role: 'james', content: data.reply }]);
    } catch {
      showToast('error', 'Communication link unstable.');
      setChat(prev => [...prev, { role: 'james', content: "Sorry Boss, connection's a bit fuzzy. Let me check the relay..." }]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    "What's my top priority today?",
    'Summarize my recent unread mail.',
    'Draft a quick follow-up to my last task.'
  ];

  return (
    <div className="fixed bottom-10 right-10 z-[1000] flex flex-col items-end gap-4">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="mb-4 h-[min(600px,calc(100vh-10rem))] w-[calc(100vw-2rem)] sm:w-[420px] premium-card flex flex-col overflow-hidden border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-primary/20 to-transparent p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
                  <Terminal className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">James Desk</h3>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Bureau Link Active</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5">
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto p-6 scrollbar-hide">
              {chat.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: msg.role === 'james' ? -10 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${msg.role === 'james' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl p-4 text-sm font-medium leading-relaxed ${
                    msg.role === 'james'
                      ? 'border border-white/5 bg-white/5 text-slate-200 italic font-mono'
                      : 'bg-primary text-white shadow-lg shadow-primary/20'
                  }`}>
                    {msg.role === 'james' ? (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                      >
                        {msg.content}
                      </motion.span>
                    ) : (
                      msg.content
                    )}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">James is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto border-t border-white/5 bg-white/[0.01] px-6 py-4 scrollbar-hide">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setMessage(action);
                  }}
                  className="whitespace-nowrap rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-primary/30 hover:text-primary"
                >
                  {action}
                </button>
              ))}
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-3 border-t border-white/10 bg-slate-900/50 p-5">
              <input
                id="james-command-input"
                name="james-command-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Command James... Ctrl+K"
                className="flex-1 rounded-xl border border-white/5 bg-white/5 px-5 py-3 text-sm text-white placeholder:text-slate-700 transition-all focus:border-primary/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!message.trim() || loading}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
            <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E')] opacity-[0.02] mix-blend-mode: overlay" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.01] to-transparent bg-[length:100%_4px] animate-scanline" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative flex items-center gap-2.5 overflow-hidden rounded-2xl border px-3 py-2.5 shadow-2xl transition-all ${
          isOpen
            ? 'border-white/10 bg-slate-900/95 text-white'
            : 'border-white/10 bg-slate-950/90 text-white hover:border-primary/30 hover:bg-slate-900/95'
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/12 via-primary/5 to-cyan-400/12 opacity-80" />
        <div className={`relative flex h-9 w-9 items-center justify-center rounded-xl border ${
          isOpen ? 'border-white/10 bg-white/5' : 'border-primary/25 bg-primary/15'
        }`}>
          <AnimatePresence mode="wait">
            {isOpen ? <X key="close" className="h-4 w-4" /> : <Sparkles key="open" className="h-4 w-4 text-primary" />}
          </AnimatePresence>
        </div>
        <div className="relative min-w-0 text-left">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">James</div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white">Desk</span>
            {!isOpen && (
              <span className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400 sm:inline-flex">
                <Command className="h-2.5 w-2.5" />
                K
              </span>
            )}
          </div>
        </div>
      </motion.button>
    </div>
  );
}
