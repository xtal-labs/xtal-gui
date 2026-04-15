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
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light mb-2">Set Up Your Wallet</h2>
        <p className="text-[var(--muted)]">
          A wallet stores your XTAL and allows you to send transactions on{' '}
          <span className="text-[var(--foreground)]">{networkName}</span>
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {WALLET_OPTIONS.map((option, index) => {
          const Icon = option.icon;

          return (
            <button
              key={option.id}
              onClick={() => !option.disabled && onSelect(option.id)}
              disabled={option.disabled}
              className={`
                group w-full chamfered p-5 text-left transition-all duration-300
                border relative overflow-hidden
                ${option.disabled
                  ? 'border-[var(--border)]/50 bg-[var(--card)]/30 opacity-60 cursor-not-allowed'
                  : 'border-[var(--border)] bg-[var(--card)]/50 hover:border-[var(--accent)]/70 hover:bg-[var(--card)]'
                }
              `}
              style={{
                animationDelay: `${index * 80}ms`,
              }}
            >
              <div className="flex items-center gap-4">
                {/* Icon container */}
                <div className={`
                  w-12 h-12 chamfered-sm flex items-center justify-center flex-shrink-0
                  ${option.disabled
                    ? 'bg-[var(--muted)]/10'
                    : option.recommended
                      ? 'bg-gradient-to-br from-[var(--accent)]/20 to-[var(--primary)]/20'
                      : 'bg-[var(--accent)]/10'
                  }
                `}>
                  <Icon className={`
                    w-5 h-5
                    ${option.disabled ? 'text-[var(--muted)]' : 'text-[var(--accent)]'}
                  `} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{option.title}</h3>
                    {option.recommended && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--muted)] mt-0.5">
                    {option.disabled ? option.disabledReason : option.description}
                  </p>
                </div>

                {/* Arrow */}
                {!option.disabled && (
                  <ArrowRight className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:translate-x-1 transition-all" />
                )}
              </div>

              {/* Recommended highlight */}
              {option.recommended && !option.disabled && (
                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                  <div className="absolute top-0 right-0 w-1 h-16 bg-gradient-to-b from-[var(--accent)] to-transparent opacity-50" />
                  <div className="absolute top-0 right-0 w-16 h-1 bg-gradient-to-l from-[var(--accent)] to-transparent opacity-50" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Info */}
      <div className="mt-6 chamfered-sm p-4 bg-[var(--accent)]/5 border border-[var(--accent)]/20">
        <p className="text-sm text-[var(--muted)]">
          <span className="text-[var(--accent)]">Tip:</span>{' '}
          Your wallet is encrypted and stored locally. Always back up your recovery phrase securely.
        </p>
      </div>
    </div>
  );
}
