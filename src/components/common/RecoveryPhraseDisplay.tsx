import { useState, useCallback } from 'react';
import { Copy, Check, AlertTriangle, Loader2, Key, Shield, EyeOff } from 'lucide-react';

interface RecoveryPhraseDisplayProps {
  mnemonic: string[];
  publicKey: string;
  masterSeed?: string;
  onConfirm: () => void;
  isProcessing?: boolean;
  showConfirmCheckbox?: boolean;
}

function truncateKey(key: string): string {
  if (key.length <= 20) return key;
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}

export function RecoveryPhraseDisplay({
  mnemonic,
  publicKey,
  masterSeed,
  onConfirm,
  isProcessing = false,
  showConfirmCheckbox = false,
}: RecoveryPhraseDisplayProps) {
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [seedRevealed, setSeedRevealed] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);

  const handleCopyMnemonic = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mnemonic.join(' '));
      setMnemonicCopied(true);
      setTimeout(() => setMnemonicCopied(false), 3000);
    } catch (e) {
      console.error('Failed to copy mnemonic:', e);
    }
  }, [mnemonic]);

  const handleCopyKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 3000);
    } catch (e) {
      console.error('Failed to copy public key:', e);
    }
  }, [publicKey]);

  const handleCopySeed = useCallback(async () => {
    if (!masterSeed) return;
    try {
      await navigator.clipboard.writeText(masterSeed);
      setSeedCopied(true);
      setTimeout(() => setSeedCopied(false), 3000);
    } catch (e) {
      console.error('Failed to copy seed:', e);
    }
  }, [masterSeed]);

  const canContinue = showConfirmCheckbox ? confirmed && !isProcessing : !isProcessing;

  return (
    <div className="animate-[fade-in-up_0.4s_ease-out]">
      {/* Warning banner */}
      <div className="chamfered-sm p-3 mb-3 bg-warning/10 border border-warning/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="text-warning font-medium mb-1">Important Security Warning</p>
          <ul className="text-warning/80 space-y-1 list-disc list-inside">
            <li>Never share these words with anyone</li>
            <li>Never enter them on any website</li>
            <li>Store them in a secure, offline location</li>
          </ul>
        </div>
      </div>

      {/* Mnemonic grid */}
      <div className="chamfered-border-wrap mb-4">
        <div className="chamfered p-4 bg-card">
          <div className="grid grid-cols-3 gap-2">
            {mnemonic.map((word, index) => (
              <div
                key={index}
                className="chamfered-sm px-3 py-2 bg-background border border-border/50 flex items-center gap-2 group hover:border-accent/50 transition-colors"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="text-xs text-foreground-muted w-5 text-right font-mono">
                  {index + 1}.
                </span>
                <span className="font-medium text-sm tracking-wide">
                  {word}
                </span>
              </div>
            ))}
          </div>

          {/* Copy mnemonic button */}
          <button
            onClick={handleCopyMnemonic}
            className="mt-3 w-full chamfered-sm py-2.5 border border-border hover:border-accent/50 flex items-center justify-center gap-2 transition-all hover:bg-accent/5"
          >
            {mnemonicCopied ? (
              <>
                <Check className="w-4 h-4 text-success" />
                <span className="text-sm text-success">Copied to clipboard</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-foreground-muted" />
                <span className="text-sm text-foreground-muted">Copy recovery phrase</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Master Public Key */}
      <div className="chamfered-sm p-3 mb-3 bg-card/50 border border-border/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Key className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-xs font-heading text-foreground-muted uppercase tracking-wider flex-shrink-0">
            Master Public Key
          </span>
          <span className="font-mono text-xs text-foreground truncate">
            {truncateKey(publicKey)}
          </span>
        </div>
        <button
          onClick={handleCopyKey}
          className="flex-shrink-0 p-1.5 chamfered-sm hover:bg-accent/10 transition-colors"
          title="Copy public key"
        >
          {keyCopied ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-foreground-muted" />
          )}
        </button>
      </div>

      {/* Master Seed (hidden by default) */}
      {masterSeed && (
        <div className="mb-3">
          {!seedRevealed ? (
            <button
              onClick={() => setSeedRevealed(true)}
              className="w-full chamfered-sm p-3 border border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 hover:border-destructive/50 hover:bg-destructive/10 transition-all"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-xs font-heading text-destructive uppercase tracking-wider">
                  Master Seed
                </span>
                <span className="text-xs text-destructive/60 italic">
                  (click to reveal)
                </span>
              </div>
              <EyeOff className="w-4 h-4 text-destructive/50 flex-shrink-0" />
            </button>
          ) : (
            <div className="chamfered-sm border border-destructive/40 bg-destructive/5 overflow-hidden">
              {/* Danger warning */}
              <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                <span className="text-xs text-destructive font-medium">
                  This seed can derive ALL private keys. Never share it.
                </span>
              </div>

              {/* Seed content */}
              <div className="p-3">
                <p
                  className="font-mono text-xs text-foreground break-all select-all leading-relaxed"
                >
                  {masterSeed}
                </p>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleCopySeed}
                    className="flex-1 chamfered-sm py-1.5 border border-destructive/30 hover:border-destructive/50 flex items-center justify-center gap-2 transition-all hover:bg-destructive/10"
                  >
                    {seedCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-success" />
                        <span className="text-xs text-success">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-destructive/70" />
                        <span className="text-xs text-destructive/70">Copy seed</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setSeedRevealed(false)}
                    className="flex-1 chamfered-sm py-1.5 border border-destructive/30 hover:border-destructive/50 flex items-center justify-center gap-2 transition-all hover:bg-destructive/10"
                  >
                    <EyeOff className="w-3.5 h-3.5 text-destructive/70" />
                    <span className="text-xs text-destructive/70">Hide seed</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation checkbox (conditional) */}
      {showConfirmCheckbox && (
        <label className="flex items-start gap-3 cursor-pointer group mb-4">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="sr-only"
            />
            <div className={`
              w-5 h-5 chamfered-sm border-2 transition-all flex items-center justify-center
              ${confirmed
                ? 'bg-accent border-accent'
                : 'bg-transparent border-border group-hover:border-accent/50'
              }
            `}>
              {confirmed && <Check className="w-3 h-3 text-accent-foreground" />}
            </div>
          </div>
          <span className="text-sm text-foreground-muted group-hover:text-foreground transition-colors">
            I have written down my recovery phrase and stored it in a secure location
          </span>
        </label>
      )}

       {/* Confirm button */}
       <button
         onClick={onConfirm}
         disabled={!canContinue}
         className={`
           w-full chamfered py-3 font-medium text-lg transition-all duration-300
           flex items-center justify-center gap-3
           ${canContinue
              ? 'bg-gradient-to-r from-accent to-primary text-foreground hover:shadow-glow hover:scale-[1.01]'
             : 'bg-muted/20 text-foreground-muted cursor-not-allowed'
           }
         `}
       >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Confirming...</span>
          </>
        ) : (
          <span>I&apos;ve Backed Up My Phrase</span>
        )}
      </button>
    </div>
  );
}
