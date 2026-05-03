export default function Logo({ className = "w-12 h-12" }) {
  return (
    <div className={`relative ${className} group`}>
      {/* Outer Glow */}
      <div className="absolute inset-0 bg-primary blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
      
      {/* Container */}
      <div className="relative w-full h-full rounded-[28%] bg-gradient-to-br from-primary via-primary to-accent p-[1px] shadow-2xl overflow-hidden active:scale-95 transition-transform">
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative w-full h-full bg-[#050505]/80 rounded-[28%] flex items-center justify-center backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="w-[60%] h-[60%] text-white fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round">
            {/* Paper Plane / Wing Hybrid */}
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            {/* AI Core pulse effect */}
            <circle cx="11" cy="13" r="1.5" className="fill-primary animate-pulse" />
          </svg>
        </div>
      </div>
    </div>
  );
}
