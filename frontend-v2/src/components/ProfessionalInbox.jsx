import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Mail, Clock, Star, ChevronRight, ArrowLeft, Sparkles, Loader2, Search, Filter, X, Eye, Zap, Shield, AlertCircle, FileText, Send, ThumbsUp, ThumbsDown, TrendingUp, Archive } from 'lucide-react';
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
    const SIDEBAR_WIDTH = 300;
    if (left < SIDEBAR_WIDTH) {
      // If flipping to left hits sidebar, stay on right but trim width or shift
      left = Math.max(SIDEBAR_WIDTH + 10, rect.right + 16);
      // If it still doesn't fit on the right, it might be a small screen
      if (left + width > window.innerWidth - padding) {
        left = window.innerWidth - width - padding;
      }
    }
    
    // Stay within vertical bounds
    top = Math.max(padding, Math.min(top, window.innerHeight - height - padding));
    
    setPosition({ top, left });
  }, [rect]);

  const cat = CATEGORY_STYLES[email.category] || CATEGORY_STYLES.STRATEGIC_FYI;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -10, scale: 0.97 }}
      transition={{ duration: 0.15 }}
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

// Full detail view (zoom-in)
function EmailDetail({ email, onBack, onAnalyze, analyzing, showToast }) {
  const sender = parseSender(email.sender);
  const cat = CATEGORY_STYLES[email.category] || CATEGORY_STYLES.STRATEGIC_FYI;
  
  return (
    <motion.div
      layoutId={`email-${email.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="h-full flex flex-col"
    >
      {/* Header bar */}
      <div className="flex items-center gap-6 p-6 border-b border-white/5">
        <button onClick={onBack} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-3 mb-1.5">
            <div className={`px-2.5 py-1 rounded-lg bg-${cat.color}-500/10 border border-${cat.color}-500/20`}>
              <span className={`text-[9px] font-black uppercase tracking-[0.2em] text-${cat.color}-400`}>{cat.label}</span>
            </div>
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{getTimeLabel(email.internalDate)}</span>
          </div>
          <h2 className="text-xl font-bold text-white truncate max-w-full">{email.subject || '(No Subject)'}</h2>
        </div>
        <div className="flex-shrink-0">
          <button
            onClick={() => onAnalyze(email)}
            disabled={analyzing}
            className="btn-gradient px-6 h-12 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{email.summary ? 'Refine Intel' : 'Analyze'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-12">
        <LayoutGroup>
        {/* Sender card */}
        <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5">
          <SenderAvatar name={sender.name} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">{sender.name}</p>
            <p className="text-xs text-slate-500 truncate">{sender.email}</p>
          </div>
        </div>

        {/* AI Summary */}
        {email.summary && (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-cyan-500/5 border border-primary/10 space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">AI Intelligence Brief</span>
            </div>
            <LinkedContent text={email.summary} className="text-sm text-slate-300 leading-relaxed font-medium" />
            {email.james_note && (
              <p className="text-xs text-primary/80 italic font-medium pt-2 border-t border-white/5">💡 {email.james_note}</p>
            )}
          </div>
        )}

        {/* Email body */}
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Email Content</p>
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap font-medium">{email.snippet}</p>
          </div>
        </div>

        {/* Tasks */}
        {email.tasks?.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Extracted Tasks</p>
            <div className="space-y-2">
              {email.tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <span className="text-sm text-slate-300 font-medium">{t.task || t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </LayoutGroup>
      </div>
    </motion.div>
  );
}

// Main compact row
function EmailRow({ email, isSelected, onSelect, onHoverStart, onHoverEnd, rowRef }) {
  const sender = parseSender(email.sender);
  const cat = CATEGORY_STYLES[email.category] || CATEGORY_STYLES.STRATEGIC_FYI;
  const isUnread = email.labels?.includes('UNREAD');
  
  return (
    <motion.div
      ref={rowRef}
      layoutId={`email-${email.id}`}
      onClick={() => onSelect(email)}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`group flex items-center gap-4 px-5 py-2 cursor-pointer transition-all duration-200 border-b border-white/[0.03] ${
        isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-white/[0.025] border-l-2 border-l-transparent'
      }`}
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
    >
      {/* Category dot */}
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 bg-${cat.color}-500 ${isUnread ? 'shadow-[0_0_8px] shadow-' + cat.color + '-500/50' : 'opacity-40'}`} />
      
      {/* Avatar */}
      <SenderAvatar name={sender.name} />
      
      {/* Sender name */}
      <div className="w-44 flex-shrink-0 min-w-0">
        <p className={`text-[13px] truncate ${isUnread ? 'font-bold text-white' : 'font-medium text-slate-400'}`}>
          {sender.name}
        </p>
      </div>

      {/* Subject + snippet */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span className={`text-[13px] truncate max-w-[40%] ${isUnread ? 'font-semibold text-slate-200' : 'font-medium text-slate-400'}`}>
          {email.subject || '(No Subject)'}
        </span>
        <span className="text-[12px] text-slate-600 truncate flex-1 font-normal">
          — {email.snippet?.slice(0, 120)}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {email.summary && <Sparkles className="w-3 h-3 text-primary/50" />}
        <span className={`text-[11px] tabular-nums ${isUnread ? 'font-bold text-slate-300' : 'text-slate-600 font-medium'}`}>
          {getTimeLabel(email.internalDate)}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
}

export default function ProfessionalInbox({ emails, setEmails, showToast, analyzeEmail, analyzingId }) {
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

  if (selectedEmail) {
    const live = emails.find(e => e.id === selectedEmail.id) || selectedEmail;
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
    <div className="space-y-6 pb-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Professional <span className="text-gradient">Inbox.</span></h2>
          <p className="text-slate-400 mt-2 text-lg font-medium">
            {emails.length} threads • {emails.filter(e => e.labels?.includes('UNREAD')).length} unread
          </p>
        </div>
      </header>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[280px] max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search emails..."
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-700 focus:outline-none focus:border-primary/50 transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/10 text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              filterCategory === 'all' ? 'bg-primary text-white shadow-lg' : 'bg-white/5 text-slate-500 hover:text-white'
            }`}
          >
            All ({emails.length})
          </button>
          {Object.entries(CATEGORY_STYLES).map(([key, val]) => {
            const count = catCounts[key];
            if (!count) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterCategory(filterCategory === key ? 'all' : key)}
                className={`px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                  filterCategory === key ? `bg-${val.color}-500/20 text-${val.color}-400 border border-${val.color}-500/30` : 'bg-white/5 text-slate-500 hover:text-white'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full bg-${val.color}-500`} />
                {val.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Email list */}
      <div className="premium-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-4">
            <Mail className="w-10 h-10 text-slate-800" />
            <p className="text-slate-600 text-sm font-bold uppercase tracking-widest">
              {searchQuery ? 'No results match your search' : 'No emails to display'}
            </p>
          </div>
        ) : (
          groupOrder.map(groupName => {
            const items = groups[groupName];
            if (!items?.length) return null;
            return (
              <div key={groupName}>
                <div className="px-5 py-2.5 bg-white/[0.02] border-b border-white/5 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-slate-700" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{groupName}</span>
                  <span className="text-[10px] text-slate-700 font-bold">{items.length}</span>
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
                  />
                ))}
              </div>
            );
          })
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
