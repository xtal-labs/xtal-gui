import { Plus, Download, SkipForward, ArrowRight } from 'lucide-react';
import type { WalletChoice } from '../useSetupWizard';

interface WalletStepProps {
  onSelect: (choice: WalletChoice) => void;
  networkName: string;
}

const WALLET_OPTIONS: {
  id: WalletChoice;
  icon: typeof Plus;
  title: string;
  description: string;
  recommended?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}[] = [
  {
    id: 'create',
    icon: Plus,
    title: 'Create New Wallet',
    description: 'Generate a new wallet with a secure recovery phrase',
    recommended: true,
  },
  {
    id: 'import',
    icon: Download,
    title: 'Import Existing Wallet',
    description: 'Restore a wallet using your 12-word recovery phrase',
  },
  {
    id: 'skip',
    icon: SkipForward,
    title: 'Skip for Now',
    description: 'Set up a wallet later from the File menu',
  },
];

export function WalletStep({ onSelect, networkName }: WalletStepProps) {
  return (
    <div className="animate-[fade-in-up_0.4s_ease-out]">
      {/* Header */}
      <div className="text-center mb-5 sm:mb-8 max-h-[560px]:mb-3">
        <h2 className="text-2xl font-light mb-2">Set Up Your Wallet</h2>
        <p className="text-muted-foreground">
          A wallet stores your XTAL and allows you to send transactions on{' '}
          <span className="text-foreground">{networkName}</span>
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3 max-h-[560px]:space-y-2">
        {WALLET_OPTIONS.map((option, index) => {
          const Icon = option.icon;

          return (
            <button
              key={option.id}
              onClick={() => !option.disabled && onSelect(option.id)}
              disabled={option.disabled}
              className={`
                group w-full chamfered p-4 sm:p-5 max-h-[560px]:p-3 text-left transition-all duration-300
                border relative overflow-hidden
                ${option.disabled
                  ? 'border-border/50 bg-card/30 opacity-60 cursor-not-allowed'
                  : 'border-border bg-card/50 hover:border-accent/70 hover:bg-card'
                }
              `}
              style={{
                animationDelay: `${index * 80}ms`,
              }}
            >
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Icon container */}
                <div className={`
                  w-10 h-10 sm:w-12 sm:h-12 chamfered-sm flex items-center justify-center flex-shrink-0
                  ${option.disabled
                    ? 'bg-muted/10'
                    : option.recommended
                      ? 'bg-gradient-to-br from-accent/20 to-primary/20'
                      : 'bg-accent/10'
                  }
                `}>
                  <Icon className={`
                    w-5 h-5
                    ${option.disabled ? 'text-muted-foreground' : 'text-accent'}
                  `} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{option.title}</h3>
                    {option.recommended && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-accent/20 text-accent rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    {option.disabled ? option.disabledReason : option.description}
                  </p>
                </div>

                {/* Arrow */}
                {!option.disabled && (
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all" />
                )}
              </div>

              {/* Recommended highlight */}
              {option.recommended && !option.disabled && (
                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                  <div className="absolute top-0 right-0 w-1 h-16 bg-gradient-to-b from-accent to-transparent opacity-50" />
                  <div className="absolute top-0 right-0 w-16 h-1 bg-gradient-to-l from-accent to-transparent opacity-50" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Info */}
      <div className="mt-4 sm:mt-6 max-h-[560px]:mt-3 chamfered-sm p-3 sm:p-4 bg-accent/5 border border-accent/20">
        <p className="text-sm text-muted-foreground">
          <span className="text-accent">Tip:</span>{' '}
          Your wallet is encrypted and stored locally. Always back up your recovery phrase securely.
        </p>
      </div>
    </div>
  );
}
