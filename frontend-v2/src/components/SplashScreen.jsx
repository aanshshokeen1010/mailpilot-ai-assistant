import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from './Logo';

export default function SplashScreen({ isReady }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const maxTimer = setTimeout(() => setShow(false), 9000);
    if (isReady) {
      const timer = setTimeout(() => setShow(false), 1000);
      return () => {
        clearTimeout(timer);
        clearTimeout(maxTimer);
      };
    }
    return () => clearTimeout(maxTimer);
  }, [isReady]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center"
        >
          {/* Background Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, ease: "backOut" }}
            className="flex flex-col items-center gap-8 relative"
          >
            <Logo className="w-24 h-24" />
            
            <div className="flex flex-col items-center gap-2">
              <motion.h1 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-4xl font-black text-white tracking-tight"
              >
                MailPilot<span className="text-primary">.</span>
              </motion.h1>
              <motion.p 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-slate-500 font-bold uppercase tracking-[0.4em] text-[10px]"
              >
                Intelligence for Inbox
              </motion.p>
            </div>

            {/* Loading Bar & Text */}
            <div className="flex flex-col items-center gap-4 mt-4">
              <div className="w-48 h-[2px] bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="w-full h-full bg-gradient-to-r from-transparent via-primary to-transparent"
                />
              </div>
              <motion.p 
                initial={{ backgroundPosition: '200% center' }}
                animate={{ backgroundPosition: '-200% center' }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="text-[9px] font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-800 via-slate-400 to-slate-800 bg-[length:200%_auto] uppercase tracking-[0.2em]"
              >
                Loading your mails for you
              </motion.p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="absolute bottom-12 flex items-center gap-2 text-slate-600 font-medium text-xs tracking-wide"
          >
            <span>v1.5.0</span>
            <span className="w-1 h-1 rounded-full bg-slate-800" />
            <span>NVIDIA NeMo Powered</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
