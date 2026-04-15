import { Download } from 'lucide-react';
import { MnemonicInput } from '@/components/common/MnemonicInput';

interface MnemonicInputStepProps {
  onSubmit: (words: string[], walletName: string) => void;
  isProcessing: boolean;
}

export function MnemonicInputStep({ onSubmit, isProcessing }: MnemonicInputStepProps) {
  return (
    <div className="animate-[fade-in-up_0.4s_ease-out]">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 chamfered bg-[var(--accent)]/10">
          <Download className="w-8 h-8 text-[var(--accent)]" />
        </div>
        <h2 className="text-2xl font-light mb-2">Restore Your Wallet</h2>
        <p className="text-[var(--muted)]">
          Enter your 12-word recovery phrase to restore an existing wallet
        </p>
      </div>

      <MnemonicInput
        onSubmit={onSubmit}
        isProcessing={isProcessing}
      />
    </div>
  );
}
