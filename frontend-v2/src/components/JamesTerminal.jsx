import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Terminal, ChevronDown, Coffee } from 'lucide-react';
import { fetchAPI } from '../api';

export default function JamesTerminal({ showToast }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([
    { role: 'james', content: "Morning, Boss! James here. I've been scanning the network—strategic context is looking solid. Anything you need deep-dived or drafted?" }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat, loading]);

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
    "Summarize my recent unread mail.",
    "Draft a quick follow-up to my last task."
  ];

  return (
    <div className="fixed bottom-8 right-8 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="mb-6 w-[calc(100vw-3rem)] sm:w-[420px] h-[min(600px,calc(100vh-10rem))] premium-card flex flex-col overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.6)] border-white/10"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 bg-gradient-to-r from-primary/20 to-transparent flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                    <Terminal className="w-5 h-5 text-white" />
                 </div>
                 <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">James Intern</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bureau Link Active</span>
                    </div>
                 </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-500 transition-colors">
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {chat.map((msg, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: msg.role === 'james' ? -10 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${msg.role === 'james' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed font-medium ${
                    msg.role === 'james' 
                      ? 'bg-white/5 text-slate-200 border border-white/5 italic' 
                      : 'bg-primary text-white shadow-lg shadow-primary/20'
                  }`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                   <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">James is thinking...</span>
                   </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="px-6 py-4 flex gap-2 overflow-x-auto scrollbar-hide border-t border-white/5 bg-white/[0.01]">
               {quickActions.map((action, i) => (
                 <button 
                  key={i} 
                  onClick={() => { setMessage(action); }}
                  className="whitespace-nowrap px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary hover:border-primary/30 transition-all"
                 >
                   {action}
                 </button>
               ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-5 bg-slate-900/50 border-t border-white/10 flex gap-3 items-center">
               <input 
                 id="james-command-input"
                 name="james-command-input"
                 value={message}
                 onChange={(e) => setMessage(e.target.value)}
                 placeholder="Command James..."
                 className="flex-1 bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-sm text-white placeholder:text-slate-700 focus:outline-none focus:border-primary/50 transition-all"
               />
               <button 
                 type="submit" 
                 disabled={!message.trim() || loading}
                 className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
               >
                 <Send className="w-5 h-5" />
               </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 rounded-[22px] flex items-center justify-center shadow-2xl transition-all relative group ${
          isOpen ? 'bg-slate-800 text-white border border-white/10' : 'btn-gradient text-white shadow-primary/30'
        }`}
      >
        <AnimatePresence mode="wait">
          {isOpen ? <X className="w-6 h-6" key="x" /> : <Coffee className="w-6 h-6" key="coffee" />}
        </AnimatePresence>
        
        {!isOpen && (
           <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full border-4 border-slate-950 animate-bounce" />
        )}

        {/* Hover Label */}
        {!isOpen && (
           <div className="absolute right-20 bg-slate-900 border border-white/10 px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-2xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-white">Talk to James</span>
           </div>
        )}
      </motion.button>
    </div>
  );
}
