import { Sparkles, Shield, Zap, ArrowRight } from 'lucide-react';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center animate-[fade-in-up_0.5s_ease-out]">
      {/* Crystal logo/icon */}
      <div className="relative inline-flex mb-8">
        {/* Outer glow */}
        <div className="absolute inset-0 bg-accent blur-3xl opacity-20 animate-pulse" />

        {/* Hexagonal container */}
        <div className="relative icon-hex w-24 h-24 bg-gradient-to-br from-accent to-primary flex items-center justify-center">
          <div className="absolute inset-1 icon-hex bg-background flex items-center justify-center">
            {/* Crystal icon - using geometric shape */}
            <svg
              viewBox="0 0 48 48"
              className="w-12 h-12"
              fill="none"
              stroke="url(#crystal-gradient)"
              strokeWidth="1.5"
            >
              <defs>
                <linearGradient id="crystal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--primary)" />
                </linearGradient>
              </defs>
              {/* Crystal shape */}
              <path d="M24 4 L40 16 L40 32 L24 44 L8 32 L8 16 Z" />
              <path d="M24 4 L24 44" opacity="0.5" />
              <path d="M8 16 L40 32" opacity="0.5" />
              <path d="M40 16 L8 32" opacity="0.5" />
            </svg>
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-light tracking-wide mb-3">
        Welcome to{' '}
        <span className="gradient-text font-medium">Crystal</span>
      </h1>

      {/* Subtitle */}
      <p className="text-muted-foreground text-lg mb-10 max-w-sm mx-auto">
        A next-generation blockchain with hybrid consensus and parallel execution
      </p>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { icon: Zap, label: 'Fast', desc: '40s stems' },
          { icon: Shield, label: 'Secure', desc: 'PoW + PoS' },
          { icon: Sparkles, label: 'Smart', desc: 'WASM contracts' },
        ].map((feature, index) => (
          <div
            key={feature.label}
            className="chamfered-sm p-4 bg-card/50 border border-border/50 transition-all duration-300 hover:border-accent/50 hover:bg-card"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <feature.icon className="w-5 h-5 mx-auto mb-2 text-accent" />
            <div className="text-sm font-medium">{feature.label}</div>
            <div className="text-xs text-muted-foreground">{feature.desc}</div>
          </div>
        ))}
      </div>

       {/* Get Started button */}
       <button
         onClick={onNext}
          className="group chamfered inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-accent to-primary text-foreground font-medium text-lg transition-all duration-300 hover:shadow-[0_0_30px_var(--accent)] hover:scale-[1.02]"
       >
         <span>Get Started</span>
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Version info */}
      <p className="mt-8 text-xs text-muted-foreground opacity-60">
        Crystal v0.1.0 &middot; First-time setup
      </p>
    </div>
  );
}
