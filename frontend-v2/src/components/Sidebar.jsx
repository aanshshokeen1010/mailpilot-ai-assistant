import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Mail, CheckSquare, PenTool, Settings, LogOut, User as UserIcon, ArrowRight } from 'lucide-react';
import { fetchAPI } from '../api';
import { toast } from 'react-toastify';
import Logo from './Logo';

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'emails', label: 'Smart Inbox', icon: Mail },
  { id: 'tasks', label: 'Action Items', icon: CheckSquare },
  { id: 'compose', label: 'AI Writer', icon: PenTool },
  { id: 'settings', label: 'Preferences', icon: Settings },
];

export default function Sidebar({ currentView, setView, userEmail, userPicture, userName, isOpen, onClose }) {
  const [isOnline, setIsOnline] = useState(null);
  const hasOrg = userEmail && userEmail.split('@')[1]?.toLowerCase() !== 'gmail.com';

  useEffect(() => {
    const checkHealth = async () => {
      // PERFORMANCE OPTIMIZATION: Don't ping server if tab is hidden
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await fetchAPI('/health');
        setIsOnline(data.status === 'ok');
      } catch {
        setIsOnline(false);
      }
    };
    
    checkHealth();
    const timer = setInterval(checkHealth, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Automatically close sidebar when view changes on mobile
    if (isOpen && onClose) {
      const handleResize = () => {
        if (window.innerWidth >= 1024) onClose();
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [isOpen]);

  const handleReconnect = () => {
    setIsOnline(null);
    fetchAPI('/health')
      .then(d => setIsOnline(d.status === 'ok'))
      .catch(() => setIsOnline(false));
  };

  const handleLogout = async () => {
    try {
      await fetchAPI('/logout', { method: 'POST' });
      toast.info('Session ended safely.');
      setTimeout(() => window.location.href = '/', 800);
    } catch {
      toast.error('Logout sync error.');
    }
  };

  const handleNavClick = (id) => {
    setView(id);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed lg:static top-0 left-0 w-72 h-screen bg-[#050505] border-r border-white/10 flex flex-col flex-shrink-0 z-50 overflow-hidden transition-transform duration-500 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-8 py-10 flex justify-between items-center">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => handleNavClick('dashboard')}>
            <Logo className="w-12 h-12" />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">MailPilot<span className="text-primary italic">.</span></h1>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mt-1">Intelligence</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 lg:hidden text-slate-500 hover:text-white">
             <ArrowRight className="w-5 h-5 rotate-180" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all duration-500 relative group ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <motion.div 
                  layoutId="activeTabGlow" 
                  className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent border-l-2 border-primary rounded-r-none" 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              <div className={`p-2 rounded-lg transition-colors duration-500 ${isActive ? 'bg-primary/20 text-primary' : 'group-hover:bg-white/5'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="font-semibold tracking-tight text-[15px]">{item.label}</span>
              {isActive && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--accent-primary-rgb,139,92,246),0.6)]"
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-6 mt-auto">
        <div className="px-3.5 pt-2 pb-4 rounded-3xl bg-white/[0.03] border border-white/10 space-y-3.5">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 border border-white/10 flex items-center justify-center overflow-hidden ${hasOrg ? 'mt-[18px]' : 'mt-1'}`}>
              {userPicture ? (
                <img src={userPicture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="flex flex-col cursor-pointer hover:opacity-80 transition-opacity min-w-0" onClick={handleReconnect}>
              {hasOrg ? (
                <div className="mb-1">
                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    {userEmail.split('@')[1]?.split('.')[0]}
                  </span>
                </div>
              ) : (
                <div className="mb-1">
                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-white/5 text-slate-500 border border-white/10">
                    Gmail / Personal
                  </span>
                </div>
              )}
              <span className="text-sm font-black text-white truncate">
                {userName || (userEmail ? userEmail.split('@')[0] : 'Sync Account')}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isOnline === null ? 'bg-slate-400 animate-pulse' : isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{isOnline === null ? 'Checking' : isOnline ? 'Live' : 'Offline'}</span>
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-rose-500/10 hover:border-rose-500/20 transition-all duration-300 text-[10px] font-black uppercase tracking-widest">
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
