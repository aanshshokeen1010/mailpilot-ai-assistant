import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Mail, Clock, Star, ChevronRight, ArrowLeft, Sparkles, Loader2, Search, Filter, X, Eye, Zap, Shield, AlertCircle, FileText, Send, ThumbsUp, ThumbsDown, TrendingUp, Archive, Trash2 } from 'lucide-react';
import { fetchAPI } from '../api';
import LinkedContent from './LinkedContent';

const CATEGORY_STYLES = {
  CRITICAL_ACTION: { color: 'rose', label: 'Critical' },
  STRATEGIC_FYI: { color: 'cyan', label: 'FYI' },
  ROUTINE_OPS: { color: 'slate', label: 'Routine' },
  FILTERED_NOISE: { color: 'zinc', label: 'Noise' },
  ASSIGNMENT_UPDATE: { color: 'amber', label: 'Assignment' },
  QUIZ_NOTICE: { color: 'orange', label: 'Quiz' },
  COURSE_ALERT: { color: 'violet', label: 'Course' },
};

function getTimeLabel(ts) {
  if (!ts) return '';
  const d = new Date(parseInt(ts));
  const now = new Date();
  const diff = now - d;
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTimeGroup(ts) {
  if (!ts) return 'Older';
  const diff = Date.now() - parseInt(ts);
  if (diff < 86400000) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  if (diff < 604800000) return 'This Week';
  return 'Earlier';
}

function parseSender(raw) {
  if (!raw) return { name: 'Unknown', email: '' };
  const match = raw.match(/^"?([^"<]+)"?\s*<?([^>]*)>?$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: raw.split('@')[0], email: raw };
}

function SenderAvatar({ name, color }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['from-violet-500 to-purple-600', 'from-cyan-500 to-blue-600', 'from-rose-500 to-pink-600', 'from-amber-500 to-orange-600', 'from-emerald-500 to-teal-600', 'from-indigo-500 to-blue-600'];
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-lg`}>
      {initials || '?'}
    </div>
  );
}

// Hover preview tooltip
function HoverPreview({ email, rect }) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  useEffect(() => {
    // Calculate best position to avoid sidebar and screen edges
    const width = 380;
    const height = 240;
    const padding = 20;
    
    let left = rect.right + 16;
    let top = rect.top;
    
    // If it hits right edge, flip to left of row
    if (left + width > window.innerWidth - padding) {
      left = rect.left - width - 16;
    }
    
    // STRICT: Never overlap the sidebar (sidebar is roughly 288px)
    const SIDEBAR_WIDTH = 320; // Increased safety margin
    if (left < SIDEBAR_WIDTH) {
      left = rect.right + 16;
      // If it still doesn't fit on the right, it might be a small screen
      if (left + width > window.innerWidth - padding) {
        left = window.innerWidth - width - padding;
      }
    }
    
    // Final check: if we are still hitting the sidebar, force it to the right
    if (left < SIDEBAR_WIDTH) left = SIDEBAR_WIDTH + 10;
    
    // Stay within vertical bounds
    top = Math.max(padding, Math.min(top, window.innerHeight - height - padding));
    
    setPosition({ top, left });
  }, [rect]);

  const cat = CATEGORY_STYLES[email.category] || CATEGORY_STYLES.STRATEGIC_FYI;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed z-[9999] w-[380px] premium-card border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-none"
      style={{ top: position.top, left: position.left }}
    >
      <div className={`px-5 py-3 border-b border-white/5 bg-${cat.color}-500/5 flex items-center gap-2`}>
        <div className={`w-2 h-2 rounded-full bg-${cat.color}-500`} />
        <span className={`text-[9px] font-black uppercase tracking-[0.2em] text-${cat.color}-400`}>{cat.label}</span>
      </div>
      <div className="p-5 space-y-3 max-h-[200px] overflow-hidden">
        <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">{email.subject}</h4>
        {email.summary ? (
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-4 italic">{email.summary}</p>
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{email.snippet?.slice(0, 200)}</p>
        )}
        {email.james_note && <p className="text-[10px] text-primary font-bold italic border-t border-white/5 pt-2">💡 {email.james_note}</p>}
      </div>
      <div className="px-5 py-2.5 bg-white/[0.02] border-t border-white/5 flex items-center gap-1.5">
        <Eye className="w-3 h-3 text-slate-600" />
        <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Click to open • Double-click for deep dive</span>
      </div>
    </motion.div>
  );
}

function EmailDetail({ email, onBack, onAnalyze, analyzing, showToast }) {
  const sender = parseSender(email.sender);
  const isCritical = email.category === 'CRITICAL_ACTION';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="flex-1 flex flex-col h-full bg-[#050505]"
    >
      {/* Header / Navigation */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="group p-2.5 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="space-y-1">
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Intelligence Detail</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             </div>
             <h3 className="text-xl font-black text-white tracking-tight">{email.subject}</h3>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => onAnalyze(email)}
            disabled={analyzing}
            className="btn-gradient px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-primary/20"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {email.summary ? 'Refine Intelligence' : 'Initialize Analysis'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto p-12 space-y-16">
          {/* Sender & Context */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <SenderAvatar name={sender.name} />
              <div>
                <p className="text-lg font-bold text-white tracking-tight">{sender.name}</p>
                <p className="text-sm text-slate-500 font-medium">{sender.email}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1">Transmission Timestamp</p>
              <p className="text-sm font-bold text-slate-300 tabular-nums">{new Date(parseInt(email.internalDate)).toLocaleString()}</p>
            </div>
          </div>

          {/* Neural Summary Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center gap-3 text-primary">
                <Sparkles className="w-5 h-5" />
                <h4 className="text-xs font-black uppercase tracking-[0.3em]">Strategic Briefing</h4>
              </div>
              
              <div className="premium-card p-10 bg-primary/5 border-primary/20 relative group">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Sparkles className="w-32 h-32 text-primary" />
                </div>
                {email.summary ? (
                  <div className="space-y-8 relative z-10">
                    <LinkedContent text={email.summary} className="text-lg text-slate-100 leading-relaxed font-medium" />
                    {email.james_note && (
                      <div className="pt-8 border-t border-white/10">
                        <div className="flex items-center gap-3 mb-3">
                           <div className="w-2 h-2 rounded-full bg-primary" />
                           <span className="text-[10px] font-black uppercase tracking-widest text-primary">Intern Note</span>
                        </div>
                        <p className="text-sm text-slate-400 font-medium italic leading-relaxed">"{email.james_note}"</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-20 text-center space-y-6">
                    <div className="w-16 h-16 rounded-3xl bg-white/[0.02] border border-dashed border-white/10 mx-auto flex items-center justify-center text-slate-700">
                      <Loader2 className="w-8 h-8" />
                    </div>
                    <p className="text-slate-500 font-medium">Strategic intelligence has not been initialized for this thread.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-8">
               {/* Categories & Stats */}
               <div className="space-y-6">
                  <div className="flex items-center gap-3 text-emerald-400">
                    <Shield className="w-5 h-5" />
                    <h4 className="text-xs font-black uppercase tracking-[0.3em]">Classification</h4>
                  </div>
                  <div className="premium-card p-6 border-white/5 bg-white/[0.01] space-y-4">
                     <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Category</span>
                        <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/30">
                          {email.category || 'Strategic FYI'}
                        </span>
                     </div>
                     <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Priority</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Level 2</span>
                     </div>
                  </div>
               </div>

               {/* Tactical Tasks */}
               <div className="space-y-6">
                  <div className="flex items-center gap-3 text-amber-500">
                    <Zap className="w-5 h-5" />
                    <h4 className="text-xs font-black uppercase tracking-[0.3em]">Action Items</h4>
                  </div>
                  <div className="space-y-3">
                    {email.tasks?.length > 0 ? (
                      email.tasks.map((t, idx) => (
                        <div key={idx} className="flex items-start gap-4 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 group hover:border-amber-500/30 transition-all">
                          <div className="mt-1 w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                          <span className="text-sm text-slate-300 font-bold leading-snug">{t.task || t}</span>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 rounded-2xl border border-dashed border-white/5 text-center">
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">No Tasks Detected</p>
                      </div>
                    )}
                  </div>
               </div>
            </div>
          </div>

          {/* Content Body */}
          <div className="space-y-6 pb-20">
            <div className="flex items-center gap-3 text-slate-600">
              <FileText className="w-5 h-5" />
              <h4 className="text-xs font-black uppercase tracking-[0.3em]">Thread Context</h4>
            </div>
            <div className="premium-card p-12 bg-white/[0.01] border-white/5">
              <p className="text-base text-slate-400 leading-relaxed font-medium whitespace-pre-wrap">{email.snippet}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reply Bar */}
      <div className="p-8 border-t border-white/5 bg-[#080808]/80 backdrop-blur-md sticky bottom-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-8">
           <div className="flex-1 flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/[0.02] border border-white/5 text-slate-500 text-sm font-medium italic">
             Ready to draft a strategic response...
           </div>
           <button className="btn-gradient px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3">
             <Send className="w-4 h-4" />
             Execute Reply
           </button>
        </div>
      </div>
    </motion.div>
  function EmailPreviewPanel({ email, onAnalyze, analyzing, showToast, onClose }) {
  const sender = parseSender(email.sender);
  const isCritical = email.category === 'CRITICAL_ACTION';

  return (
    <motion.div 
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="w-full lg:w-[450px] bg-[#0a0a0a] border-l border-white/10 flex flex-col shadow-2xl relative z-30"
    >
      {/* Panel Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Intelligence Brief</span>
        </div>
        <button
          onClick={() => onAnalyze(email)}
          disabled={analyzing}
          className="btn-gradient px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2"
        >
          {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {email.summary ? 'Refine' : 'Analyze'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
        {/* Header Info */}
        <div className="space-y-4">
          <h3 className="text-2xl font-black text-white tracking-tight leading-tight">{email.subject || '(No Subject)'}</h3>
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <SenderAvatar name={sender.name} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">{sender.name}</p>
              <p className="text-xs text-slate-500 truncate">{sender.email}</p>
            </div>
            <span className="text-[10px] font-bold text-slate-600 tabular-nums">{getTimeLabel(email.internalDate)}</span>
          </div>
        </div>

        {/* AI Summary Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Neural Summary</span>
          </div>
          {email.summary ? (
            <div className="premium-card p-6 bg-primary/5 border-primary/20 space-y-4">
              <LinkedContent text={email.summary} className="text-sm text-slate-200 leading-relaxed font-medium" />
              {email.james_note && (
                <div className="pt-4 border-t border-white/5">
                   <p className="text-xs text-primary font-bold italic">💡 James: {email.james_note}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 rounded-3xl border border-dashed border-white/10 text-center space-y-4">
              <p className="text-xs text-slate-500 font-medium">No intelligence brief generated yet.</p>
              <button onClick={() => onAnalyze(email)} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">Initialize Analysis</button>
            </div>
          )}
        </div>

        {/* Tactical Tasks */}
        <div className="space-y-4">
           <div className="flex items-center gap-2 text-amber-500">
             <Zap className="w-4 h-4" />
             <span className="text-[10px] font-black uppercase tracking-[0.3em]">Tactical Extraction</span>
           </div>
           {email.tasks?.length > 0 ? (
             <div className="space-y-3">
                {email.tasks.map((t, idx) => (
                  <div key={idx} className="flex items-start gap-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 group">
                    <div className="mt-1 w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                    <span className="text-[13px] text-slate-300 font-medium leading-snug">{t.task || t}</span>
                  </div>
                ))}
             </div>
           ) : (
             <p className="text-xs text-slate-600 italic px-2">No actionable tasks identified in this thread.</p>
           )}
        </div>

        {/* Full Context (Snippet) */}
        <div className="space-y-4">
           <div className="flex items-center gap-2 text-slate-500">
             <Mail className="w-4 h-4" />
             <span className="text-[10px] font-black uppercase tracking-[0.3em]">Origin Context</span>
           </div>
           <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
              <p className="text-sm text-slate-400 leading-relaxed font-medium whitespace-pre-wrap">{email.snippet}</p>
           </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-white/5 bg-[#050505] grid grid-cols-2 gap-4">
        <button className="py-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all">Archive</button>
        <button className="py-4 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">Reply with AI</button>
      </div>
    </motion.div>
  );
}

function EmailRow({ email, isSelected, onSelect, onHoverStart, onHoverEnd, rowRef, showToast }) {
  const [isStarred, setIsStarred] = useState(email.labels?.includes('STARRED'));
  const [checked, setChecked] = useState(false);
  const sender = parseSender(email.sender);
  const cat = CATEGORY_STYLES[email.category] || CATEGORY_STYLES.STRATEGIC_FYI;
  const isUnread = email.labels?.includes('UNREAD');
  const isCritical = email.category === 'CRITICAL_ACTION';
  
  const handleStar = (e) => {
    e.stopPropagation();
    setIsStarred(!isStarred);
    showToast('info', isStarred ? 'Removed from Strategic Watchlist.' : 'Added to Strategic Watchlist.');
  };

  const handleCheck = (e) => {
    e.stopPropagation();
    setChecked(!checked);
  };

  return (
    <motion.div
      ref={rowRef}
      layoutId={`email-${email.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(email)}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`group relative flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-200 border-b border-white/[0.03] ${
        isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
      } ${isUnread ? 'bg-white/[0.01]' : 'opacity-80'}`}
      whileHover={{ x: 2 }}
    >
      {/* 1. Selection & Star */}
      <div className="flex items-center gap-3 flex-shrink-0 w-12 justify-center">
        <button 
          onClick={handleCheck}
          className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${checked ? 'bg-primary border-primary' : 'border-white/10 group-hover:border-white/30'}`}
        >
          {checked && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
        </button>
        <button 
          onClick={handleStar}
          className={`transition-colors ${isStarred ? 'text-amber-400' : 'text-slate-700 hover:text-slate-500'}`}
        >
          <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400' : ''}`} />
        </button>
      </div>

      {/* 2. Sender (High Density) */}
      <div className="w-48 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-${cat.color}-500 ${isUnread ? 'animate-pulse' : 'opacity-30'}`} />
          <p className={`text-[13px] truncate tracking-tight ${isUnread ? 'font-black text-white' : 'font-semibold text-slate-400'}`}>
            {sender.name}
          </p>
        </div>
      </div>

      {/* 3. Subject & Snippet (The "Gmail" feel) */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className={`text-[13px] truncate tracking-tight ${isUnread ? 'font-bold text-slate-200' : 'font-medium text-slate-500'}`}>
          {email.subject || '(No Subject)'}
        </span>
        <span className="text-[12px] text-slate-600 truncate flex-1 font-medium italic opacity-60">
          {email.summary && !email.summary.startsWith('////') 
            ? `[AI Summary] ${email.summary.slice(0, 80)}...` 
            : `— ${email.snippet?.slice(0, 100)}`}
        </span>
      </div>

      {/* 4. Date & Quick Actions */}
      <div className="flex items-center gap-4 flex-shrink-0 ml-auto pl-4">
        {/* Quick Actions (Appear on hover) */}
        <div className="hidden group-hover:flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 shadow-xl">
           <button onClick={(e) => { e.stopPropagation(); /* Archive */ }} className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors">
              <Archive className="w-3.5 h-3.5" />
           </button>
           <button onClick={(e) => { e.stopPropagation(); /* Delete */ }} className="p-1.5 hover:bg-white/10 rounded-md text-rose-400/50 hover:text-rose-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
           </button>
           <button onClick={(e) => { e.stopPropagation(); /* Deep Dive */ }} className="p-1.5 hover:bg-primary/20 rounded-md text-primary transition-colors">
              <Zap className="w-3.5 h-3.5" />
           </button>
        </div>

        <div className="flex items-center gap-2">
          {email.summary && <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />}
          <span className={`text-[11px] tabular-nums tracking-tighter ${isUnread ? 'font-black text-slate-300' : 'text-slate-600 font-bold'}`}>
            {getTimeLabel(email.internalDate)}
          </span>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-800" />
      </div>
    </motion.div>
  );
}

export default function ProfessionalInbox({ emails = [], analyzeEmail, analyzingId, showToast, isBridge = true }) {
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [hoveredEmail, setHoveredEmail] = useState(null);
  const [hoverRect, setHoverRect] = useState(null);
  const hoverTimerRef = useRef(null);
  const rowRefs = useRef({});

  const handleHoverStart = useCallback((email, id) => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const el = rowRefs.current[id];
      if (el) {
        setHoverRect(el.getBoundingClientRect());
        setHoveredEmail(email);
      }
    }, 400); // 400ms delay before showing preview
  }, []);

  const handleHoverEnd = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    setHoveredEmail(null);
    setHoverRect(null);
  }, []);

  // Filter + search
  const filtered = emails.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (e.subject || '').toLowerCase().includes(q) ||
             (e.sender || '').toLowerCase().includes(q) ||
             (e.snippet || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Group by time
  const groups = {};
  filtered.forEach(e => {
    const g = getTimeGroup(e.internalDate);
    if (!groups[g]) groups[g] = [];
    groups[g].push(e);
  });
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier', 'Older'];

  // Category counts for filter bar
  const catCounts = {};
  emails.forEach(e => {
    const c = e.category || 'STRATEGIC_FYI';
    catCounts[c] = (catCounts[c] || 0) + 1;
  });

  const handleAnalyze = async (email) => {
    if (analyzeEmail) await analyzeEmail(email);
  };

  const liveSelected = emails.find(e => e.id === selectedEmail?.id);

  // Mode Switching Logic
  if (selectedEmail && !isBridge) {
    const live = liveSelected || selectedEmail;
    return (
      <div className="h-[calc(100vh-8rem)] premium-card overflow-hidden">
        <AnimatePresence mode="wait">
          <EmailDetail
            key={live.id}
            email={live}
            onBack={() => setSelectedEmail(null)}
            onAnalyze={handleAnalyze}
            analyzing={analyzingId === live.id}
            showToast={showToast}
          />
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-full mx-auto space-y-6 pb-2">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{isBridge ? 'Bridge' : 'Professional'} <span className="text-gradient">Inbox.</span></h2>
          <p className="text-slate-400 mt-2 text-lg font-medium">
            {emails.length} threads • {emails.filter(e => e.labels?.includes('UNREAD')).length} unread
          </p>
        </div>
      </header>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-4 flex-wrap bg-white/[0.01] p-2 rounded-2xl border border-white/5 mx-4">
        <div className="relative flex-1 min-w-[240px] max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tactical Thread Search..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-primary/50 transition-all"
          />
        </div>

        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
              filterCategory === 'all' ? 'bg-primary text-white shadow-lg' : 'bg-white/5 text-slate-500 hover:text-white'
            }`}
          >
            All
          </button>
          {Object.entries(CATEGORY_STYLES).map(([key, val]) => {
            const count = catCounts[key];
            if (!count) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterCategory(filterCategory === key ? 'all' : key)}
                className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                  filterCategory === key ? `bg-${val.color}-500/20 text-${val.color}-400 border border-${val.color}-500/30` : 'bg-white/5 text-slate-500 hover:text-white'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full bg-${val.color}-500`} />
                {val.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tactical View Container */}
      <div className={`flex-1 flex overflow-hidden premium-card mx-4 mb-4 ${!isBridge ? 'flex-col' : ''}`}>
        {/* Email List */}
        <div className={`flex-1 flex flex-col min-w-0 ${isBridge ? 'border-r border-white/5' : ''} overflow-hidden`}>
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-900/10">
              <Mail className="w-10 h-10 text-slate-800" />
              <p className="text-slate-600 text-sm font-bold uppercase tracking-widest">
                {searchQuery ? 'No tactical matches' : 'Intelligence queue empty'}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.03]">
              {groupOrder.map(groupName => {
                const items = groups[groupName];
                if (!items || items.length === 0) return null;
                
                return (
                  <div key={groupName} className="relative">
                    <div className="sticky top-0 z-20 px-5 py-2 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Clock className="w-3 h-3 text-slate-600" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{groupName}</span>
                      </div>
                      <span className="text-[9px] text-slate-800 font-black uppercase tracking-widest">{items.length} THREADS</span>
                    </div>
                    {items.map(email => (
                      <EmailRow
                        key={email.id}
                        email={email}
                        isSelected={selectedEmail?.id === email.id}
                        onSelect={setSelectedEmail}
                        onHoverStart={() => handleHoverStart(email, email.id)}
                        onHoverEnd={handleHoverEnd}
                        rowRef={el => { if (el) rowRefs.current[email.id] = el; }}
                        showToast={showToast}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Intelligence Panel (Only in Bridge Mode) */}
        {isBridge && (
          <AnimatePresence mode="wait">
            {selectedEmail ? (
              <EmailPreviewPanel 
                key={selectedEmail.id}
                email={liveSelected || selectedEmail}
                onAnalyze={handleAnalyze}
                analyzing={analyzingId === selectedEmail.id}
                showToast={showToast}
                onClose={() => setSelectedEmail(null)}
              />
            ) : (
              <div className="hidden lg:flex w-full lg:w-[450px] bg-slate-950/20 items-center justify-center p-12 text-center flex-col gap-6">
                 <div className="w-20 h-20 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex items-center justify-center text-slate-800">
                    <Mail className="w-10 h-10" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600 mb-2">Bridge Protocol Active</p>
                    <p className="text-sm text-slate-700 font-medium leading-relaxed">Select a thread to initialize AI context extraction and strategic briefing.</p>
                 </div>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Hover preview tooltip */}
      <AnimatePresence>
        {hoveredEmail && hoverRect && (
          <HoverPreview email={hoveredEmail} rect={hoverRect} />
        )}
      </AnimatePresence>
    </div>
  );
}
