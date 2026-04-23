import { useState, useCallback } from 'react';
import { CheckCircle, Eye, EyeOff, Lock, Shield, Loader2, ArrowRight } from 'lucide-react';

interface ImportPasswordStepProps {
  walletName: string;
  onSetPassword: (password: string) => void;
  onSkip: () => void;
  isProcessing: boolean;
}

export function ImportPasswordStep({
  walletName,
  onSetPassword,
  onSkip,
  isProcessing,
}: ImportPasswordStepProps) {
  const [wantsPassword, setWantsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const passwordValid = password.length >= 8;
  const confirmValid = password === confirmPassword && confirmPassword.length > 0;
  const canSetPassword = passwordValid && confirmValid && !isProcessing;

  const handleSetPassword = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (canSetPassword) {
        onSetPassword(password);
      }
    },
    [canSetPassword, password, onSetPassword]
  );

  // Allow Enter to submit even when the submit button is disabled
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canSetPassword) {
        e.preventDefault();
        onSetPassword(password);
      }
    },
    [canSetPassword, password, onSetPassword]
  );

  return (
    <div className="animate-[fade-in-up_0.4s_ease-out]">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 chamfered bg-success/10">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-2xl font-light mb-2">Wallet Imported Successfully</h2>
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">{walletName}</span> has been restored from your recovery phrase
        </p>
      </div>

      {/* Password toggle */}
      <div className="chamfered-border-wrap mb-6">
        <div className="chamfered p-5 bg-card">
          <button
            type="button"
            onClick={() => setWantsPassword(!wantsPassword)}
            disabled={isProcessing}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className={`
                w-10 h-10 chamfered-sm flex items-center justify-center transition-colors
                ${wantsPassword ? 'bg-accent/20' : 'bg-muted/30'}
              `}>
                <Lock className={`
                  w-5 h-5 transition-colors
                  ${wantsPassword ? 'text-accent' : 'text-muted-foreground'}
                `} />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm">Add Password Protection</p>
                <p className="text-xs text-muted-foreground">Encrypt your wallet with a password</p>
              </div>
            </div>

            {/* Toggle */}
            <div className={`
              w-11 h-6 chamfered-sm relative transition-colors
              ${wantsPassword ? 'bg-accent' : 'bg-border'}
            `}>
              <div className={`
                absolute top-0.5 w-5 h-5 chamfered-sm bg-white transition-all
                ${wantsPassword ? 'left-[22px]' : 'left-0.5'}
              `} />
            </div>
          </button>

          {/* Password fields (conditional) */}
          {wantsPassword && (
            <form onSubmit={handleSetPassword} onKeyDown={handleKeyDown} className="mt-5 pt-5 border-t border-border/50 space-y-4">
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
                    disabled={isProcessing}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full chamfered-sm px-4 py-3 pr-12 bg-background border border-border transition-all focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                    placeholder="Minimum 8 characters"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {password.length > 0 && !passwordValid && (
                  <p className="mt-1 text-xs text-destructive">Password must be at least 8 characters</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium mb-2 text-muted-foreground">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isProcessing}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full chamfered-sm px-4 py-3 bg-background border border-border transition-all focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                  placeholder="Re-enter password"
                />
                {confirmPassword.length > 0 && !confirmValid && (
                  <p className="mt-1 text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              {/* Set Password button */}
              <button
                type="submit"
                disabled={!canSetPassword}
                className={`
                  w-full chamfered py-4 font-medium text-lg transition-all duration-300
                  flex items-center justify-center gap-3
                  ${canSetPassword
                    ? 'bg-gradient-to-r from-accent to-primary text-white hover:shadow-[0_0_30px_var(--accent)] hover:scale-[1.01]'
                    : 'bg-muted/20 text-muted-foreground cursor-not-allowed'
                  }
                `}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Setting Password...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    <span>Set Password</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="chamfered-sm p-4 mb-6 bg-accent/5 border border-accent/20">
        <p className="text-sm text-muted-foreground">
          <span className="text-accent">Tip:</span>{' '}
          Your wallet is stored locally on this device. A password adds an extra layer of security
          to prevent unauthorized access.
        </p>
      </div>

      {/* Skip button (shown when password toggle is off, or always as secondary) */}
      {!wantsPassword && (
        <button
          onClick={onSkip}
          disabled={isProcessing}
          className={`
            w-full chamfered py-4 font-medium text-lg transition-all duration-300
            flex items-center justify-center gap-3
            bg-gradient-to-r from-accent to-primary text-white
            hover:shadow-[0_0_30px_var(--accent)] hover:scale-[1.01]
          `}
        >
          <span>Continue</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
