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
  const [archival, setArchival] = useState(true);
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
    <div className="animate-[fade-in-up_0.4s_ease-out] pb-6 max-h-[560px]:pb-3">
      {/* Header */}
      <div className="text-center mb-4 sm:mb-6 max-h-[560px]:mb-3">
        <h2 className="text-xl sm:text-2xl font-light mb-2">Choose Your Fruit Shards</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Crystal's stem/leaf architecture lets you validate a subset of
          fruit shards while still participating in the network
        </p>
      </div>

      {/* Educational callout */}
      <div className="chamfered-sm p-3 max-h-[560px]:p-2 bg-accent/5 border border-accent/20 mb-4 sm:mb-6 max-h-[560px]:mb-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-accent">
            <Sprout className="w-3 h-3 inline -mt-0.5 mr-1" />
            How it works:
          </span>{' '}
          Stems and leaves form the core chain that every node validates.
          Fruits are parallel PoS shards — you only need to process the
          ones you care about. Fewer shards means less storage and bandwidth.
        </p>
      </div>

       {/* Preset buttons */}
       <div className="flex flex-col min-[520px]:flex-row gap-2 mb-4 max-h-[560px]:mb-3">
         <button
           onClick={selectAppleOnly}
           disabled={true}
           className={`
             flex-1 chamfered-sm py-2 px-3 text-xs font-medium transition-all duration-200
             flex items-center justify-center gap-1.5
             opacity-50 cursor-not-allowed
              bg-card/30 border border-border text-muted-foreground
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
               : 'bg-card/50 border border-border text-muted-foreground hover:border-amber-500/30'
            }
          `}
        >
          <Pickaxe className="w-3 h-3" /> All Fruits
          <span className="text-[9px] uppercase tracking-wider opacity-70 ml-0.5">Recommended</span>
        </button>
      </div>

      {/* Fruit grid */}
      <div className="grid grid-cols-2 min-[520px]:grid-cols-3 gap-2 mb-4 sm:mb-5 max-h-[560px]:gap-1.5 max-h-[560px]:mb-3">
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
                group relative chamfered-sm p-2 sm:p-3 max-h-[560px]:p-1.5 transition-all duration-200
                border text-center
                ${isSelected
                  ? `bg-gradient-to-br ${colors.bg} ${colors.border} shadow-md ${colors.glow}`
                  : 'bg-card/30 border-border opacity-40 hover:opacity-60'
                }
                ${isApple ? 'cursor-default' : ''}
              `}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Fruit emoji */}
              <span className="text-xl sm:text-2xl block mb-1 max-h-[560px]:text-lg max-h-[560px]:mb-0.5" role="img" aria-label={fruit}>
                {colors.emoji}
              </span>

              {/* Fruit name */}
              <span className={`
                text-xs font-medium block
                ${isSelected ? 'text-foreground' : 'text-muted-foreground'}
              `}>
                {fruit}
              </span>

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5">
                  {isApple ? (
                    <Lock className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <Check className="w-3 h-3 text-success" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Mining eligibility note */}
      {allSelected ? (
        <div className="chamfered-sm p-3 max-h-[560px]:p-2 bg-amber-500/5 border border-amber-500/20 mb-4 max-h-[560px]:mb-3">
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <Pickaxe className="w-3.5 h-3.5 flex-shrink-0" />
            All shards selected — this node is eligible for PoW mining
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center mb-4">
          Select all 9 fruits to enable mining &middot;{' '}
          <span className="text-foreground">{selected.size}</span> of {ALL_FRUITS.length} selected
        </p>
      )}

      {/* Toggle options */}
      <div className="chamfered-sm bg-card/50 border border-border mb-4 max-h-[560px]:mb-3 divide-y divide-border/50">
        {/* Transaction Index toggle */}
        <div className="p-3 sm:p-4 max-h-[560px]:p-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Search className={`w-5 h-5 flex-shrink-0 ${txIndex ? 'text-accent' : 'text-muted-foreground'}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium">Transaction Index</p>
              <p className="text-xs text-muted-foreground">
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
      <div className="mb-5 sm:mb-6 max-h-[560px]:mb-3">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full chamfered-sm py-2.5 px-4 text-xs font-medium transition-all duration-200
            bg-card/30 border border-border text-muted-foreground
            hover:border-accent/30 hover:text-foreground
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
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 ml-1">Sync Mode</p>
            <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-2">
               {/* Fast Sync */}
               <button
                 onClick={() => handleSyncModeChange('fast')}
                 disabled={true}
                 className={`
                   chamfered-sm p-3 max-h-[560px]:p-2 text-left transition-all duration-200 border
                   opacity-50 cursor-not-allowed
                    bg-card/20 border-border
                 `}
               >
                 <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                     Fast Sync
                   </span>
                 </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                   Download state at a checkpoint and verify forward
                 </p>
                 <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1.5 inline-block">Under Development</span>
               </button>

              {/* Full Sync */}
              <button
                onClick={() => handleSyncModeChange('full')}
                disabled={isProcessing}
                className={`
                  chamfered-sm p-3 max-h-[560px]:p-2 text-left transition-all duration-200 border
                  ${syncMode === 'full'
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-card/30 border-border hover:border-amber-500/20'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className={`w-4 h-4 ${syncMode === 'full' ? 'text-amber-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium ${syncMode === 'full' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Full Sync
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Re-execute every block from genesis
                </p>
              </button>
            </div>
          </div>

          {/* Full sync info note */}
          {syncMode === 'full' && (
            <div className="chamfered-sm p-3 max-h-[560px]:p-2 bg-amber-500/5 border border-amber-500/20 mb-3 animate-[fade-in-up_0.2s_ease-out]">
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
          <div className="chamfered-sm bg-card/50 border border-border">
            <div className="p-3 sm:p-4 max-h-[560px]:p-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <HardDrive className={`w-5 h-5 flex-shrink-0 ${archival ? 'text-accent' : 'text-muted-foreground'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    Archival Mode
                    {archivalLocked && (
                      <Lock className="w-3 h-3 text-amber-400/70" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
          group w-full chamfered py-3 sm:py-4 max-h-[560px]:py-2.5 font-medium transition-all duration-300
          flex items-center justify-center gap-2
          ${isProcessing
            ? 'bg-muted/20 text-muted-foreground cursor-wait'
            : 'bg-gradient-to-r from-accent to-primary text-white hover:shadow-[0_0_30px_var(--accent)] hover:scale-[1.01]'
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
