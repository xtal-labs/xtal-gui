import { useEffect, useRef } from 'react';
import { ChevronLeft, AlertTriangle, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSetupWizard, WizardStep } from './useSetupWizard';
import { WelcomeStep } from './steps/WelcomeStep';
import { NetworkStep } from './steps/NetworkStep';
import { WalletStep } from './steps/WalletStep';
import { CreateWalletStep } from './steps/CreateWalletStep';
import { MnemonicStep } from './steps/MnemonicStep';
import { MnemonicInputStep } from './steps/MnemonicInputStep';
import { ImportPasswordStep } from './steps/ImportPasswordStep';
// NodeTypeStep removed from step flow temporarily - kept for later re-integration
// import { NodeTypeStep } from './steps/NodeTypeStep';
import { CompleteStep } from './steps/CompleteStep';
import { useSetupWindowSizing } from './useSetupWindowSizing';

// Step labels for progress indicator
const STEP_LABELS: Record<WizardStep, string> = {
  'welcome': 'Welcome',
  'network': 'Network',
  // 'node-type': 'Node Type',  // removed temporarily
  'wallet-choice': 'Wallet',
  'wallet-create': 'Create',
  'mnemonic': 'Backup',
  'wallet-import-mnemonic': 'Recovery',
  'wallet-import-password': 'Security',
  'complete': 'Launch',
};

// Progress indicator component
function ProgressIndicator({
  currentStep,
  walletChoice,
}: {
  currentStep: WizardStep;
  walletChoice: string | null;
}) {
  // Determine which steps to show based on wallet choice (node-type removed temporarily)
  const steps: WizardStep[] = walletChoice === 'skip'
    ? ['welcome', 'network', 'wallet-choice', 'complete']
    : walletChoice === 'import'
    ? ['welcome', 'network', 'wallet-choice', 'wallet-import-mnemonic', 'wallet-import-password', 'complete']
    : ['welcome', 'network', 'wallet-choice', 'wallet-create', 'mnemonic', 'complete'];

  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="max-w-full overflow-x-auto pb-1">
      <div className="mx-auto flex min-w-max items-center justify-center gap-2 max-h-[560px]:gap-1.5">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;

          return (
            <div key={step} className="flex items-center">
              {/* Step marker */}
              <div className="relative">
                {/* Diamond shape */}
                <div
                    className={`
                    w-3 h-3 rotate-45 transition-all duration-300
                    ${isCompleted ? 'bg-success shadow-[0_0_12px_var(--success)]' : ''}
                    ${isCurrent ? 'bg-accent shadow-[0_0_16px_var(--accent)] scale-125' : ''}
                    ${isUpcoming ? 'bg-border opacity-40' : ''}
                  `}
                />
                {/* Pulse effect for current */}
                {isCurrent && (
                  <div className="absolute inset-0 w-3 h-3 rotate-45 bg-accent animate-ping opacity-30" />
                )}
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`
                    w-8 h-0.5 mx-1 transition-all duration-500 max-h-[560px]:w-5
                    ${index < currentIndex ? 'bg-success' : 'bg-border opacity-30'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Error toast component
function ErrorToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-3 left-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 animate-[fade-in-up_0.3s_ease-out] sm:bottom-6">
      <div
        className="chamfered-border-wrap shadow-xl"
        style={{ '--_cb-color': 'rgb(239 68 68 / 0.3)' } as React.CSSProperties}
      >
      <div className="chamfered bg-red-500/10 px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
        <span className="text-red-200 text-sm max-w-md">{message}</span>
        <button
          onClick={onClose}
          className="ml-2 text-red-400 hover:text-red-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      </div>
    </div>
  );
}

export function SetupWizard() {
  const { state, actions, computed } = useSetupWizard();
  const headerRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // 'node-type' removed from flow temporarily
  const wideStep = state.step === 'complete';
  const contentWidthClass = wideStep
    ? 'max-w-[42rem]'
    : state.step === 'mnemonic' || state.step === 'wallet-import-mnemonic'
      ? 'max-w-[40rem]'
      : 'max-w-lg';

  useSetupWindowSizing({
    headerRef,
    progressRef,
    mainRef,
    contentRef,
    dependencies: [state.step, state.walletChoice],
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && computed.canGoBack()) {
        actions.goBack();
      }

      // Enter to proceed on steps without their own form handling
      if (e.key === 'Enter' && !state.isProcessing) {
        const target = e.target as HTMLElement;
        if (target.closest('form') || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return; // Let form-based steps handle Enter themselves
        }

        switch (state.step) {
          case 'welcome':
            actions.goToStep('network');
            break;
          case 'complete':
            actions.completeSetup();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, computed, state.step, state.isProcessing]);

  // Render current step
  const renderStep = () => {
    // Hold the UI until the active-network pointer check resolves so a pending
    // switch lands directly on the wallet step without flashing the welcome step.
    if (state.initializing) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 rotate-45 animate-spin border-2 border-accent border-t-transparent" />
        </div>
      );
    }

    switch (state.step) {
      case 'welcome':
        return (
          <WelcomeStep
            onNext={() => actions.goToStep('network')}
          />
        );
      case 'network':
        return (
          <NetworkStep
            onSelect={actions.selectNetwork}
            isProcessing={state.isProcessing}
          />
        );
      // 'node-type' step removed temporarily - kept for later re-integration
      // case 'node-type':
      //   return (
      //     <NodeTypeStep
      //       onSelect={actions.selectNodeType}
      //       isProcessing={state.isProcessing}
      //     />
      //   );
      case 'wallet-choice':
        return (
          <WalletStep
            onSelect={actions.selectWalletChoice}
            networkName={state.network?.name || ''}
          />
        );
      case 'wallet-create':
        return (
          <CreateWalletStep
            onSubmit={actions.createWallet}
            isProcessing={state.isProcessing}
          />
        );
      case 'mnemonic':
        return (
          <MnemonicStep
            mnemonic={state.mnemonic}
            publicKey={state.walletAddress}
            masterSeed={state.masterSeed || undefined}
            onConfirm={actions.confirmBackup}
            isProcessing={state.isProcessing}
          />
        );
      case 'wallet-import-mnemonic':
        return (
          <MnemonicInputStep
            onSubmit={actions.importWallet}
            isProcessing={state.isProcessing}
          />
        );
      case 'wallet-import-password':
        return (
          <ImportPasswordStep
            walletName={state.importWalletName}
            onSetPassword={actions.setImportPassword}
            onSkip={actions.skipImportPassword}
            isProcessing={state.isProcessing}
          />
        );
      case 'complete':
        return (
          <CompleteStep
            network={state.network}
            selectedFruits={state.selectedFruits}
            archival={state.archival}
            txIndex={state.txIndex}
            syncMode={state.syncMode}
            walletName={state.walletChoice === 'create' || state.walletChoice === 'import' ? state.walletName : null}
            walletAddress={state.walletAddress}
            dataDir={state.dataDir}
            onLaunch={actions.completeSetup}
            isProcessing={state.isProcessing}
          />
        );
    }
  };

  return (
    <div className="setup-wizard relative h-dvh min-h-[var(--app-min-height)] min-w-[var(--app-min-width)] overflow-hidden bg-background">
      {/* Crystalline background effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Radial gradient backdrop */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(ellipse at 30% 20%, var(--accent) 0%, transparent 50%),
                        radial-gradient(ellipse at 70% 80%, var(--primary) 0%, transparent 40%)`,
          }}
        />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(var(--foreground) 1px, transparent 1px),
                             linear-gradient(90deg, var(--foreground) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
        {/* Corner facet decorations */}
        <div className="absolute top-0 left-0 w-32 h-32 border-l border-t border-accent opacity-20" />
        <div className="absolute top-0 right-0 w-32 h-32 border-r border-t border-accent opacity-20" />
        <div className="absolute bottom-0 left-0 w-32 h-32 border-l border-b border-primary opacity-20" />
        <div className="absolute bottom-0 right-0 w-32 h-32 border-r border-b border-primary opacity-20" />
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* Header */}
        <header
          ref={headerRef}
          className="shrink-0 px-3 py-2.5 sm:px-6 sm:py-4 max-h-[560px]:py-2 flex items-center justify-between"
        >
          {/* Back button */}
          <div className="w-20 sm:w-24">
            {computed.canGoBack() && (
              <button
                onClick={actions.goBack}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors group"
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-sm">Back</span>
              </button>
            )}
          </div>

          {/* Step label */}
          <div className="text-center">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {STEP_LABELS[state.step]}
            </span>
          </div>

          {/* Spacer for symmetry */}
          <div className="w-20 sm:w-24" />
        </header>

        {/* Progress indicator */}
        <div ref={progressRef} className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-6 max-h-[560px]:pb-2">
          <ProgressIndicator
            currentStep={state.step}
            walletChoice={state.walletChoice}
          />
        </div>

        {/* Main content */}
        <main
          ref={mainRef}
          className="relative flex-1 min-h-0 px-3 pb-3 sm:px-6 sm:pb-6 max-h-[560px]:pb-2"
        >
          <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl items-stretch min-[900px]:items-center">
            <ScrollArea ref={contentRef} className="max-h-full w-full">
              <div className={`mx-auto w-full ${contentWidthClass} px-4 py-5 sm:px-6 sm:py-6 max-h-[560px]:px-3 max-h-[560px]:py-3`}>
                {renderStep()}
              </div>
            </ScrollArea>
          </div>
        </main>
      </div>

      {/* Error toast */}
      {state.error && (
        <ErrorToast
          message={state.error}
          onClose={actions.clearError}
        />
      )}
    </div>
  );
}
