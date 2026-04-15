import { useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface MnemonicInputProps {
  onSubmit: (words: string[], walletName: string) => void;
  isProcessing: boolean;
  defaultWalletName?: string;
  /** If true, the first word input gets autoFocus */
  autoFocus?: boolean;
  submitLabel?: string;
  processingLabel?: string;
}

export function MnemonicInput({
  onSubmit,
  isProcessing,
  defaultWalletName = 'default',
  autoFocus = true,
  submitLabel = 'Import Wallet',
  processingLabel = 'Importing Wallet...',
}: MnemonicInputProps) {
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [walletName, setWalletName] = useState(defaultWalletName);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const allWordsFilled = words.every((w) => w.trim().length > 0);
  const nameValid = walletName.trim().length >= 1 && walletName.trim().length <= 32;
  const canSubmit = allWordsFilled && nameValid && !isProcessing;

  const setWord = useCallback((index: number, value: string) => {
    setWords((prev) => {
      const next = [...prev];
      next[index] = value.toLowerCase().trim();
      return next;
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>, _index: number) => {
      const pasted = e.clipboardData.getData('text').trim();
      const pastedWords = pasted.split(/[\s,]+/).filter(Boolean);

      if (pastedWords.length >= 2) {
        e.preventDefault();
        setWords((prev) => {
          const next = [...prev];
          for (let i = 0; i < 12; i++) {
            if (i < pastedWords.length) {
              next[i] = pastedWords[i].toLowerCase();
            }
          }
          return next;
        });
        // Focus the wallet name field after pasting all words
        const nameInput = document.getElementById('import-wallet-name');
        if (nameInput) nameInput.focus();
      }
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === 'Tab' && !e.shiftKey && index === 11) {
        // Let default Tab move to wallet name
        return;
      }
      if (e.key === 'Enter' || (e.key === ' ' && words[index].trim().length > 0)) {
        e.preventDefault();
        if (index < 11) {
          inputRefs.current[index + 1]?.focus();
        } else {
          document.getElementById('import-wallet-name')?.focus();
        }
      }
      if (e.key === 'Backspace' && words[index] === '' && index > 0) {
        e.preventDefault();
        inputRefs.current[index - 1]?.focus();
      }
    },
    [words]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (canSubmit) {
        onSubmit(
          words.map((w) => w.trim()),
          walletName.trim()
        );
      }
    },
    [canSubmit, words, walletName, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit}>
      {/* Mnemonic grid */}
      <div className="chamfered-border-wrap mb-5">
        <div className="chamfered p-4 bg-card">
          <div className="grid grid-cols-3 gap-2">
            {words.map((word, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5"
              >
                <span className="text-xs text-foreground-muted w-5 text-right font-mono flex-shrink-0">
                  {index + 1}.
                </span>
                <input
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  value={word}
                  onChange={(e) => setWord(index, e.target.value)}
                  onPaste={(e) => handlePaste(e, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  autoFocus={autoFocus && index === 0}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={isProcessing}
                  className={`
                    w-full chamfered-sm px-2 py-2 bg-background border font-mono text-sm
                    transition-all focus:outline-none focus:ring-1 focus:ring-accent/50
                    ${word.trim()
                      ? 'border-accent/30 text-foreground'
                      : 'border-border/50 text-foreground'
                    }
                    focus:border-accent
                    placeholder:text-foreground-muted
                  `}
                  placeholder={`word ${index + 1}`}
                />
              </div>
            ))}
          </div>

          {/* Paste hint */}
          <p className="mt-3 text-center text-xs text-foreground-muted">
            Tip: Paste your full 12-word phrase into any field to auto-fill all words
          </p>
        </div>
      </div>

      {/* Wallet Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-foreground-muted">
          Wallet Name
        </label>
        <input
          id="import-wallet-name"
          type="text"
          value={walletName}
          onChange={(e) => setWalletName(e.target.value)}
          disabled={isProcessing}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full chamfered-sm px-4 py-3 bg-card border border-border transition-all focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          placeholder="default"
        />
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={`
          w-full chamfered py-4 font-medium text-lg transition-all duration-300
          flex items-center justify-center gap-3
          ${canSubmit
            ? 'bg-gradient-to-r from-accent to-primary text-primary-foreground hover:shadow-glow hover:scale-[1.01]'
            : 'bg-muted/20 text-foreground-muted cursor-not-allowed'
          }
        `}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{processingLabel}</span>
          </>
        ) : (
          <span>{submitLabel}</span>
        )}
      </button>
    </form>
  );
}
