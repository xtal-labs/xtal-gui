import { useState, useCallback } from 'react';
import { Eye, EyeOff, Loader2, Check, X, Wallet } from 'lucide-react';

interface CreateWalletStepProps {
  onSubmit: (walletName: string, password: string) => void;
  isProcessing: boolean;
}

// Password strength checker
function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 2) return { score, label: 'Fair', color: 'bg-amber-500' };
  if (score <= 3) return { score, label: 'Good', color: 'bg-yellow-500' };
  if (score <= 4) return { score, label: 'Strong', color: 'bg-emerald-500' };
  return { score, label: 'Very Strong', color: 'bg-emerald-400' };
}

export function CreateWalletStep({ onSubmit, isProcessing }: CreateWalletStepProps) {
  const [walletName, setWalletName] = useState('default');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [touched, setTouched] = useState({ name: false, password: false, confirm: false });

  // Validation
  const nameValid = walletName.trim().length >= 1 && walletName.trim().length <= 32;
  const passwordValid = password.length >= 8;
  const confirmValid = password === confirmPassword && confirmPassword.length > 0;
  const strength = getPasswordStrength(password);
  const canSubmit = nameValid && passwordValid && confirmValid && !isProcessing;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      onSubmit(walletName.trim(), password);
    }
  }, [canSubmit, walletName, password, onSubmit]);

  // Allow Enter to submit even when the submit button is disabled
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      onSubmit(walletName.trim(), password);
    }
  }, [canSubmit, walletName, password, onSubmit]);

  return (
    <div className="animate-[fade-in-up_0.4s_ease-out]">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 chamfered bg-accent/10">
          <Wallet className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-2xl font-light mb-2">Create Your Wallet</h2>
        <p className="text-muted-foreground">
          Choose a name and secure password for your wallet
        </p>
      </div>

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-5">
        {/* Wallet Name */}
        <div>
          <label className="block text-sm font-medium mb-2 text-muted-foreground">
            Wallet Name
          </label>
          <input
            type="text"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, name: true }))}
            disabled={isProcessing}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={`
              w-full chamfered-sm px-4 py-3 bg-card border transition-all
              focus:outline-none focus:ring-2 focus:ring-accent/50
              ${touched.name && !nameValid
                ? 'border-red-500/50'
                : 'border-border focus:border-accent'
              }
            `}
            placeholder="default"
          />
          {touched.name && !nameValid && (
            <p className="mt-1 text-xs text-red-400">Name must be 1-32 characters</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium mb-2 text-muted-foreground">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, password: true }))}
              disabled={isProcessing}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`
                w-full chamfered-sm px-4 py-3 pr-12 bg-card border transition-all
                focus:outline-none focus:ring-2 focus:ring-accent/50
                ${touched.password && !passwordValid
                  ? 'border-red-500/50'
                  : 'border-border focus:border-accent'
                }
              `}
              placeholder="Minimum 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Password strength */}
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i <= strength.score ? strength.color : 'bg-border'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Password strength: <span className="text-foreground">{strength.label}</span>
              </p>
            </div>
          )}

          {touched.password && !passwordValid && (
            <p className="mt-1 text-xs text-red-400">Password must be at least 8 characters</p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium mb-2 text-muted-foreground">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
              disabled={isProcessing}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`
                w-full chamfered-sm px-4 py-3 pr-20 bg-card border transition-all
                focus:outline-none focus:ring-2 focus:ring-accent/50
                ${touched.confirm && !confirmValid
                  ? 'border-red-500/50'
                  : confirmValid
                    ? 'border-emerald-500/50'
                    : 'border-border focus:border-accent'
                }
              `}
              placeholder="Re-enter password"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {confirmPassword.length > 0 && (
                confirmValid
                  ? <Check className="w-4 h-4 text-emerald-400" />
                  : <X className="w-4 h-4 text-red-400" />
              )}
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          {touched.confirm && !confirmValid && confirmPassword.length > 0 && (
            <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!canSubmit}
          className={`
            w-full chamfered py-4 font-medium text-lg transition-all duration-300
            flex items-center justify-center gap-3
             ${canSubmit
               ? 'bg-gradient-to-r from-accent to-primary text-foreground hover:shadow-[0_0_30px_var(--accent)] hover:scale-[1.01]'
               : 'bg-muted/20 text-muted-foreground cursor-not-allowed'
             }
          `}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Creating Wallet...</span>
            </>
          ) : (
            <span>Create Wallet</span>
          )}
        </button>
      </form>

      {/* Security note */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Your wallet will be encrypted with this password. Store it safely.
      </p>
    </div>
  );
}
