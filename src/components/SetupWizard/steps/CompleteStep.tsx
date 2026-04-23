import { Rocket, Check, Folder, Globe, Wallet, Loader2, Server, HardDrive, Search, RefreshCw } from 'lucide-react';
import { FRUIT_COLORS } from '@/lib/fruitColors';
import type { NetworkInfo, SyncModeOption } from '../useSetupWizard';

const TOTAL_FRUITS = Object.keys(FRUIT_COLORS).length;

interface CompleteStepProps {
  network: NetworkInfo | null;
  selectedFruits: string[];
  archival: boolean;
  txIndex: boolean;
  syncMode: SyncModeOption;
  walletName: string | null;
  walletAddress: string;
  dataDir: string;
  onLaunch: () => void;
  isProcessing: boolean;
}

function getNodeTypeLabel(fruitCount: number, archival: boolean, syncMode: SyncModeOption): string {
  if (syncMode === 'full') return 'Full Sync Node';
  if (archival) return 'Archival Node';
  if (fruitCount === TOTAL_FRUITS) return 'Full Node';
  return 'Light Node';
}

export function CompleteStep({
  network,
  selectedFruits,
  archival,
  txIndex,
  syncMode,
  walletName,
  walletAddress,
  dataDir,
  onLaunch,
  isProcessing,
}: CompleteStepProps) {
  const formatAddress = (addr: string) => addr;
  const nodeTypeLabel = getNodeTypeLabel(selectedFruits.length, archival, syncMode);

  return (
    <div className="animate-[fade-in-up_0.4s_ease-out]">
      {/* Success icon */}
      <div className="text-center mb-8">
        <div className="relative inline-flex">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 animate-pulse" />

          {/* Checkmark container */}
          <div className="relative icon-hex w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <div className="icon-hex w-16 h-16 bg-background flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-400" strokeWidth={3} />
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-light mt-6 mb-2">Setup Complete!</h2>
        <p className="text-muted-foreground">
          Your Crystal node is ready to launch
        </p>
      </div>

      {/* Configuration summary */}
      <div className="chamfered-border-wrap mb-8">
      <div className="chamfered bg-card divide-y divide-border/50">
        {/* Network */}
        <div className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 chamfered-sm bg-emerald-500/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Network</p>
            <p className="font-medium">{network?.name || 'Unknown'}</p>
          </div>
          <Check className="w-4 h-4 text-emerald-400" />
        </div>

        {/* Node Type */}
        <div className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 chamfered-sm bg-amber-500/10 flex items-center justify-center">
            {archival ? (
              <HardDrive className="w-5 h-5 text-amber-400" />
            ) : (
              <Server className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Node Type</p>
            <div className="flex items-center gap-2">
              <p className="font-medium">{nodeTypeLabel}</p>
              <span className="text-xs text-muted-foreground">
                {selectedFruits.length} of {TOTAL_FRUITS}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex gap-0.5">
                {selectedFruits.map(fruit => (
                  <span key={fruit} className="text-sm" title={fruit}>
                    {FRUIT_COLORS[fruit]?.emoji || fruit}
                  </span>
                ))}
              </div>
              {syncMode === 'full' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  <RefreshCw className="w-2.5 h-2.5" />
                  Full Sync
                </span>
              )}
              {txIndex && (
                <span className="inline-flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  <Search className="w-2.5 h-2.5" />
                  TxIndex
                </span>
              )}
            </div>
          </div>
          <Check className="w-4 h-4 text-emerald-400" />
        </div>

        {/* Wallet */}
        <div className="p-4 flex items-center gap-4">
          <div className={`w-10 h-10 chamfered-sm flex items-center justify-center ${
            walletName ? 'bg-emerald-500/10' : 'bg-muted/10'
          }`}>
            <Wallet className={`w-5 h-5 ${walletName ? 'text-emerald-400' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Wallet</p>
            {walletName ? (
              <div>
                <p className="font-medium">{walletName}</p>
                {walletAddress && (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {formatAddress(walletAddress)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Not created (can set up later)</p>
            )}
          </div>
          {walletName && <Check className="w-4 h-4 text-emerald-400" />}
        </div>

        {/* Data Directory */}
        <div className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 chamfered-sm bg-accent/10 flex items-center justify-center">
            <Folder className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Data Directory</p>
            <p className="font-mono text-sm text-muted-foreground truncate">
              {dataDir || '~/.crystal/'}
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* Launch button */}
      <button
        onClick={onLaunch}
        disabled={isProcessing}
        className={`
          group w-full chamfered py-5 font-medium text-lg transition-all duration-300
          flex items-center justify-center gap-3
          ${isProcessing
            ? 'bg-muted/20 text-muted-foreground cursor-wait'
            : 'bg-gradient-to-r from-accent to-primary text-white hover:shadow-[0_0_40px_var(--accent)] hover:scale-[1.02]'
          }
        `}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Launching Crystal...</span>
          </>
        ) : (
          <>
            <Rocket className="w-6 h-6 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
            <span>Launch Crystal</span>
          </>
        )}
      </button>

      {/* Note */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        The application will restart and connect to the {network?.name || 'network'}
      </p>
    </div>
  );
}
