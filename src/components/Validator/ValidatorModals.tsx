import { Play, Plus, X, Eye, EyeOff, RefreshCw, AlertCircle, Minus, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MnemonicInput } from "@/components/common/MnemonicInput";
import { RecoveryPhraseDisplay } from "@/components/common/RecoveryPhraseDisplay";
import { shardsToXtal } from "@/lib/utils";
import type { ValidatorWalletCreationResult } from "@/types";

// Modal IDs
const MODAL_LOAD_VALIDATOR = "validator-load";
const MODAL_CREATE_WALLET = "validator-create";
const MODAL_IMPORT_VALIDATOR = "validator-import";
const MODAL_MNEMONIC_DISPLAY = "validator-mnemonic";
const MODAL_STAKE = "validator-stake";
const MODAL_UNSTAKE = "validator-unstake";

// Load Validator Modal
function LoadValidatorModal({
  show,
  selectedWallet,
  password,
  showPassword,
  isLoading,
  error,
  onClose,
  onPasswordChange,
  onSubmit,
  onTogglePasswordVisibility,
}: {
  show: boolean;
  selectedWallet: string | null;
  password: string;
  showPassword: boolean;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onTogglePasswordVisibility: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-foreground">
      <Card variant="crystalline" className="w-full max-w-md mx-4 ">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading tracking-wide">START VALIDATOR</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>Enter password to unlock {selectedWallet}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              autoComplete="current-password"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={onTogglePasswordVisibility}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            className="w-full"
            onClick={onSubmit}
            disabled={isLoading || !password}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Start Validator
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Create Validator Wallet Modal
function CreateWalletModal({
  show,
  newWalletName,
  password,
  confirmPassword,
  showPassword,
  isLoading,
  error,
  onClose,
  onNewWalletNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onTogglePasswordVisibility,
}: {
  show: boolean;
  newWalletName: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onNewWalletNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onTogglePasswordVisibility: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-foreground">
      <Card variant="crystalline" className="w-full max-w-md mx-4 ">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading tracking-wide">CREATE VALIDATOR WALLET</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Create a new standalone validator wallet for fruit production
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading && newWalletName && password && confirmPassword) {
                e.preventDefault();
                onSubmit();
              }
            }}
          >
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-heading text-foreground-muted mb-2 block">
              Wallet Name
            </label>
            <Input
              type="text"
              placeholder="my-validator"
              value={newWalletName}
              onChange={(e) => onNewWalletNameChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-heading text-foreground-muted mb-2 block">
              Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoComplete="new-password"
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={onTogglePasswordVisibility}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-heading text-foreground-muted mb-2 block">
              Confirm Password
            </label>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !newWalletName || !password || !confirmPassword}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create Wallet
          </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Mnemonic Display Modal
function MnemonicModal({
  show,
  creationResult,
  onConfirm,
}: {
  show: boolean;
  creationResult: ValidatorWalletCreationResult | null;
  onConfirm: () => void;
}) {
  if (!show || !creationResult) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-foreground">
      <Card variant="crystalline" className="w-full max-w-lg mx-4">
        <CardContent className="pt-6">
          <RecoveryPhraseDisplay
            mnemonic={creationResult.mnemonic}
            publicKey={creationResult.address}
            masterSeed={creationResult.masterSeed}
            onConfirm={onConfirm}
            showConfirmCheckbox={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Import Validator Wallet Modal (two-step: mnemonic → password)
function ImportValidatorModal({
  show,
  step,
  password,
  confirmPassword,
  showPassword,
  isProcessing,
  error,
  onClose,
  onMnemonicSubmit,
  onPasswordChange,
  onConfirmPasswordChange,
  onTogglePasswordVisibility,
  onBack,
  onSubmit,
}: {
  show: boolean;
  step: "mnemonic" | "password";
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  isProcessing: boolean;
  error: string | null;
  onClose: () => void;
  onMnemonicSubmit: (words: string[], walletName: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePasswordVisibility: () => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-foreground">
      <Card variant="crystalline" className="w-full max-w-lg mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading tracking-wide">IMPORT VALIDATOR WALLET</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            {step === "mnemonic"
              ? "Enter your 12-word recovery phrase to import a validator wallet"
              : "Set a password to encrypt your validator wallet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {step === "mnemonic" ? (
            <MnemonicInput
              onSubmit={onMnemonicSubmit}
              isProcessing={false}
              defaultWalletName="my-validator"
              submitLabel="Continue"
              processingLabel="Processing..."
              autoFocus
            />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isProcessing && password && confirmPassword) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            >
              <div>
                <label className="text-sm font-heading text-foreground-muted mb-2 block">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password (min 8 characters)"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    autoFocus
                    autoComplete="new-password"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={onTogglePasswordVisibility}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-heading text-foreground-muted mb-2 block">
                  Confirm Password
                </label>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => onConfirmPasswordChange(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  type="button"
                  className="flex-1"
                  onClick={onBack}
                  disabled={isProcessing}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isProcessing || !password || !confirmPassword}
                >
                  {isProcessing ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Import Wallet
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Stake Modal
function StakeModal({
  show,
  stakeAmount,
  availableBalance,
  totalStake,
  effectiveStake,
  pendingStake,
  isLoading,
  error,
  onClose,
  onStakeAmountChange,
  onSubmit,
}: {
  show: boolean;
  stakeAmount: string;
  availableBalance: number;
  totalStake: number;
  effectiveStake: number;
  pendingStake: number;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onStakeAmountChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-foreground">
      <Card variant="crystalline" className="w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading tracking-wide">STAKE XTAL</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Stake XTAL to increase your fruit production eligibility
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-heading text-foreground-muted mb-2 block">
              Amount (XTAL)
            </label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={stakeAmount}
              onChange={(e) => onStakeAmountChange(e.target.value)}
              min={0}
              step={1}
            />
          </div>
          <div className="text-sm text-foreground-muted bg-muted/50 p-3 chamfered-sm space-y-1">
            <p>Available: <span className="font-mono font-semibold text-foreground">{shardsToXtal(availableBalance).toLocaleString()} XTAL</span></p>
            <p>Total stake: <span className="font-mono">{shardsToXtal(totalStake).toLocaleString()} XTAL</span></p>
            <p>Active stake: <span className="font-mono">{shardsToXtal(effectiveStake).toLocaleString()} XTAL</span></p>
            {pendingStake > 0 && (
              <p className="text-warning">Pending stake: <span className="font-mono">{shardsToXtal(pendingStake).toLocaleString()} XTAL</span></p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={onSubmit}
            disabled={isLoading || !stakeAmount || availableBalance === 0}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Stake XTAL
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Unstake Modal
function UnstakeModal({
  show,
  stakeAmount,
  matureStake,
  pendingUnstake,
  isLoading,
  error,
  onClose,
  onStakeAmountChange,
  onSubmit,
}: {
  show: boolean;
  stakeAmount: string;
  matureStake: number;
  pendingUnstake: number;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onStakeAmountChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-foreground">
      <Card variant="crystalline" className="w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading tracking-wide">UNSTAKE XTAL</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Withdraw staked XTAL from your validator
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          <div className="bg-warning/10 border border-warning/20 chamfered-sm p-3 text-sm">
            <p className="font-medium text-warning mb-1">Timelock Notice</p>
            <p className="text-foreground-muted">
              Unstaked funds will be locked for 1 epoch before becoming available.
            </p>
          </div>
          <div>
            <label className="text-sm font-heading text-foreground-muted mb-2 block">
              Amount (XTAL)
            </label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={stakeAmount}
              onChange={(e) => onStakeAmountChange(e.target.value)}
              min={0}
              max={shardsToXtal(matureStake)}
              step={1}
            />
          </div>
          <div className="text-sm text-foreground-muted bg-muted/50 p-3 chamfered-sm space-y-1">
            <p>Mature stake: <span className="font-mono font-semibold text-foreground">{shardsToXtal(matureStake).toLocaleString()} XTAL</span></p>
            {pendingUnstake > 0 && (
              <p className="text-warning">Pending unstake: <span className="font-mono">{shardsToXtal(pendingUnstake).toLocaleString()} XTAL</span></p>
            )}
          </div>
          <Button
            variant="destructive"
            className="w-full"
            onClick={onSubmit}
            disabled={isLoading || !stakeAmount || matureStake === 0}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Minus className="h-4 w-4 mr-2" />
            )}
            Unstake XTAL
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export {
  MODAL_LOAD_VALIDATOR,
  MODAL_CREATE_WALLET,
  MODAL_IMPORT_VALIDATOR,
  MODAL_MNEMONIC_DISPLAY,
  MODAL_STAKE,
  MODAL_UNSTAKE,
  LoadValidatorModal,
  CreateWalletModal,
  ImportValidatorModal,
  MnemonicModal,
  StakeModal,
  UnstakeModal,
};
