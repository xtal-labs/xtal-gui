import { useState } from 'react';
import { Lock, Check, Pickaxe, HardDrive, Loader2, ArrowRight, Sprout, Search, Zap, RefreshCw, ChevronDown, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { FRUIT_COLORS } from '@/lib/fruitColors';
import type { SyncModeOption } from '../useSetupWizard';

interface NodeTypeStepProps {
  onSelect: (selectedFruits: string[], archival: boolean, txIndex: boolean, syncMode: SyncModeOption) => void;
  isProcessing: boolean;
}

const ALL_FRUITS = Object.keys(FRUIT_COLORS);

export function NodeTypeStep({ onSelect, isProcessing }: NodeTypeStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_FRUITS));
  const [archival, setArchival] = useState(false);
  const [txIndex, setTxIndex] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncModeOption>('full');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const allSelected = selected.size === ALL_FRUITS.length;
  const archivalLocked = syncMode === 'full';

  const toggleFruit = (fruit: string) => {
    if (fruit === 'Apple') return; // Apple is mandatory
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(fruit)) {
        next.delete(fruit);
      } else {
        next.add(fruit);
      }
      return next;
    });
  };

  const selectAppleOnly = () => {
    setSelected(new Set(['Apple']));
  };

  const selectAll = () => {
    setSelected(new Set(ALL_FRUITS));
  };

  const handleSyncModeChange = (mode: SyncModeOption) => {
    setSyncMode(mode);
    if (mode === 'full') {
      setArchival(true);
    }
  };

  const handleContinue = () => {
    onSelect(Array.from(selected), archival, txIndex, syncMode);
  };

  return (
    <div className="animate-[fade-in-up_0.4s_ease-out] pb-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-light mb-2">Choose Your Fruit Shards</h2>
        <p className="text-[var(--muted)] text-sm max-w-md mx-auto">
          Crystal's stem/leaf architecture lets you validate a subset of
          fruit shards while still participating in the network
        </p>
      </div>

      {/* Educational callout */}
      <div className="chamfered-sm p-3 bg-[var(--accent)]/5 border border-[var(--accent)]/20 mb-6">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          <span className="text-[var(--accent)]">
            <Sprout className="w-3 h-3 inline -mt-0.5 mr-1" />
            How it works:
          </span>{' '}
          Stems and leaves form the core chain that every node validates.
          Fruits are parallel PoS shards — you only need to process the
          ones you care about. Fewer shards means less storage and bandwidth.
        </p>
      </div>

       {/* Preset buttons */}
       <div className="flex gap-2 mb-4">
         <button
           onClick={selectAppleOnly}
           disabled={true}
           className={`
             flex-1 chamfered-sm py-2 px-3 text-xs font-medium transition-all duration-200
             flex items-center justify-center gap-1.5
             opacity-50 cursor-not-allowed
             bg-[var(--card)]/30 border border-[var(--border)] text-[var(--muted)]
           `}
         >
           {FRUIT_COLORS.Apple.emoji} Apple Only
           <span className="text-[9px] uppercase tracking-wider opacity-70 ml-0.5">Under Development</span>
         </button>
        <button
          onClick={selectAll}
          disabled={isProcessing}
          className={`
            flex-1 chamfered-sm py-2 px-3 text-xs font-medium transition-all duration-200
            flex items-center justify-center gap-1.5
            ${allSelected
              ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400'
              : 'bg-[var(--card)]/50 border border-[var(--border)] text-[var(--muted)] hover:border-amber-500/30'
            }
          `}
        >
          <Pickaxe className="w-3 h-3" /> All Fruits
          <span className="text-[9px] uppercase tracking-wider opacity-70 ml-0.5">Recommended</span>
        </button>
      </div>

      {/* Fruit grid */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {ALL_FRUITS.map((fruit, index) => {
          const colors = FRUIT_COLORS[fruit] || FRUIT_COLORS.Apple;
          const isSelected = selected.has(fruit);
          const isApple = fruit === 'Apple';

          return (
            <button
              key={fruit}
              onClick={() => toggleFruit(fruit)}
              disabled={isApple || isProcessing}
              className={`
                group relative chamfered-sm p-3 transition-all duration-200
                border text-center
                ${isSelected
                  ? `bg-gradient-to-br ${colors.bg} ${colors.border} shadow-md ${colors.glow}`
                  : 'bg-[var(--card)]/30 border-[var(--border)] opacity-40 hover:opacity-60'
                }
                ${isApple ? 'cursor-default' : ''}
              `}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Fruit emoji */}
              <span className="text-2xl block mb-1" role="img" aria-label={fruit}>
                {colors.emoji}
              </span>

              {/* Fruit name */}
              <span className={`
                text-xs font-medium block
                ${isSelected ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}
              `}>
                {fruit}
              </span>

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5">
                  {isApple ? (
                    <Lock className="w-3 h-3 text-[var(--muted)]" />
                  ) : (
                    <Check className="w-3 h-3 text-[var(--success)]" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Mining eligibility note */}
      {allSelected ? (
        <div className="chamfered-sm p-3 bg-amber-500/5 border border-amber-500/20 mb-4">
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <Pickaxe className="w-3.5 h-3.5 flex-shrink-0" />
            All shards selected — this node is eligible for PoW mining
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)] text-center mb-4">
          Select all 9 fruits to enable mining &middot;{' '}
          <span className="text-[var(--foreground)]">{selected.size}</span> of {ALL_FRUITS.length} selected
        </p>
      )}

      {/* Toggle options */}
      <div className="chamfered-sm bg-[var(--card)]/50 border border-[var(--border)] mb-4 divide-y divide-[var(--border)]/50">
        {/* Transaction Index toggle */}
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Search className={`w-5 h-5 flex-shrink-0 ${txIndex ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium">Transaction Index</p>
              <p className="text-xs text-[var(--muted)]">
                Enables block explorer lookups &middot; Uses additional disk space
              </p>
            </div>
          </div>
          <Switch
            checked={txIndex}
            onCheckedChange={setTxIndex}
            disabled={isProcessing}
          />
        </div>
      </div>

      {/* Advanced section — collapsible */}
      <div className="mb-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full chamfered-sm py-2.5 px-4 text-xs font-medium transition-all duration-200
            bg-[var(--card)]/30 border border-[var(--border)] text-[var(--muted)]
            hover:border-[var(--accent)]/30 hover:text-[var(--foreground)]
            flex items-center justify-between"
        >
          <span className="uppercase tracking-wider">Advanced</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        <div
          className={`
            overflow-hidden transition-all duration-300 ease-in-out
            ${showAdvanced ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}
          `}
        >
          {/* Sync Mode selector */}
          <div className="mb-3">
            <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 ml-1">Sync Mode</p>
            <div className="grid grid-cols-2 gap-2">
               {/* Fast Sync */}
               <button
                 onClick={() => handleSyncModeChange('fast')}
                 disabled={true}
                 className={`
                   chamfered-sm p-3 text-left transition-all duration-200 border
                   opacity-50 cursor-not-allowed
                   bg-[var(--card)]/20 border-[var(--border)]
                 `}
               >
                 <div className="flex items-center gap-2 mb-1">
                   <Zap className="w-4 h-4 text-[var(--muted)]" />
                   <span className="text-sm font-medium text-[var(--muted)]">
                     Fast Sync
                   </span>
                 </div>
                 <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                   Download state at a checkpoint and verify forward
                 </p>
                 <span className="text-[9px] uppercase tracking-wider text-[var(--muted)] mt-1.5 inline-block">Under Development</span>
               </button>

              {/* Full Sync */}
              <button
                onClick={() => handleSyncModeChange('full')}
                disabled={isProcessing}
                className={`
                  chamfered-sm p-3 text-left transition-all duration-200 border
                  ${syncMode === 'full'
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-[var(--card)]/30 border-[var(--border)] hover:border-amber-500/20'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className={`w-4 h-4 ${syncMode === 'full' ? 'text-amber-400' : 'text-[var(--muted)]'}`} />
                  <span className={`text-sm font-medium ${syncMode === 'full' ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}`}>
                    Full Sync
                  </span>
                </div>
                <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                  Re-execute every block from genesis
                </p>
              </button>
            </div>
          </div>

          {/* Full sync info note */}
          {syncMode === 'full' && (
            <div className="chamfered-sm p-3 bg-amber-500/5 border border-amber-500/20 mb-3 animate-[fade-in-up_0.2s_ease-out]">
              <p className="text-xs text-amber-300/90 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Full sync re-executes every block from genesis and retains all historical data.
                  This requires significantly more disk space and initial sync time, but provides
                  the highest level of independent verification.
                </span>
              </p>
            </div>
          )}

          {/* Archival toggle */}
          <div className="chamfered-sm bg-[var(--card)]/50 border border-[var(--border)]">
            <div className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <HardDrive className={`w-5 h-5 flex-shrink-0 ${archival ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    Archival Mode
                    {archivalLocked && (
                      <Lock className="w-3 h-3 text-amber-400/70" />
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {archivalLocked
                      ? 'Required by Full Sync — all historical data retained'
                      : 'Keep all historical fruit data indefinitely'}
                  </p>
                </div>
              </div>
              <Switch
                checked={archival}
                onCheckedChange={setArchival}
                disabled={isProcessing || archivalLocked}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={isProcessing}
        className={`
          group w-full chamfered py-4 font-medium transition-all duration-300
          flex items-center justify-center gap-2
          ${isProcessing
            ? 'bg-[var(--muted)]/20 text-[var(--muted)] cursor-wait'
            : 'bg-gradient-to-r from-[var(--accent)] to-[var(--primary)] text-white hover:shadow-[0_0_30px_var(--accent)] hover:scale-[1.01]'
          }
        `}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <>
            <span>Continue</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>
    </div>
  );
}
