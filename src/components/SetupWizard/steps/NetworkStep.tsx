import { useState, useEffect } from 'react';
import { Globe, FlaskConical, Server, Loader2, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { NetworkInfo } from '../useSetupWizard';

interface NetworkStepProps {
  onSelect: (network: NetworkInfo) => void;
  isProcessing: boolean;
}

// Network icons and colors
const NETWORK_CONFIG: Record<string, {
  icon: typeof Globe;
  color: string;
  accent: string;
}> = {
  mainnet: {
    icon: Globe,
    color: 'from-emerald-500 to-teal-600',
    accent: 'emerald',
  },
  testnet: {
    icon: FlaskConical,
    color: 'from-amber-500 to-orange-600',
    accent: 'amber',
  },
  regtest: {
    icon: Server,
    color: 'from-slate-500 to-slate-600',
    accent: 'slate',
  },
};

export function NetworkStep({ onSelect, isProcessing }: NetworkStepProps) {
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch available networks
  useEffect(() => {
    async function fetchNetworks() {
      try {
        const result = await invoke<NetworkInfo[]>('get_available_networks');
        setNetworks(result);
      } catch (e) {
        console.error('Failed to fetch networks:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchNetworks();
  }, []);

  const handleSelect = (network: NetworkInfo) => {
    setSelectedId(network.id);
    onSelect(network);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="animate-[fade-in-up_0.4s_ease-out]">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light mb-2">Choose Your Network</h2>
        <p className="text-[var(--muted)]">
          Select which Crystal network to connect to
        </p>
      </div>

      {/* Network cards */}
      <div className="space-y-4">
        {networks.map((network, index) => {
          const config = NETWORK_CONFIG[network.id] || NETWORK_CONFIG.mainnet;
          const Icon = config.icon;
          const isSelected = selectedId === network.id;
          const isProcessingThis = isProcessing && isSelected;

          return (
            <button
              key={network.id}
              onClick={() => handleSelect(network)}
              disabled={isProcessing}
              className={`
                group w-full chamfered p-5 text-left transition-all duration-300
                border-2 relative overflow-hidden
                ${isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                  : 'border-[var(--border)] bg-[var(--card)]/50 hover:border-[var(--accent)]/50 hover:bg-[var(--card)]'
                }
                ${isProcessing && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              {/* Background gradient on hover/select */}
              <div
                className={`
                  absolute inset-0 bg-gradient-to-r ${config.color} opacity-0 transition-opacity duration-300
                  ${isSelected ? 'opacity-5' : 'group-hover:opacity-[0.02]'}
                `}
              />

              <div className="relative flex items-center gap-4">
                {/* Icon */}
                <div className={`
                  icon-hex w-14 h-14 flex-shrink-0 flex items-center justify-center
                  bg-gradient-to-br ${config.color}
                `}>
                  <div className="icon-hex w-12 h-12 bg-[var(--background)] flex items-center justify-center">
                    {isProcessingThis ? (
                      <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                    ) : isSelected && !isProcessing ? (
                      <Check className="w-6 h-6 text-[var(--success)]" />
                    ) : (
                      <Icon className={`w-6 h-6 text-${config.accent}-400`} />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-lg">{network.name}</h3>
                    {network.id === 'mainnet' && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                        Production
                      </span>
                    )}
                    {network.id === 'testnet' && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                        Development
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--muted)] mt-0.5">
                    {network.description}
                  </p>
                </div>

                {/* Selection indicator */}
                <div className={`
                  w-3 h-3 rotate-45 transition-all duration-300
                  ${isSelected ? 'bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]' : 'bg-[var(--border)]'}
                `} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Info text */}
      <p className="mt-6 text-center text-xs text-[var(--muted)]">
        Mainnet uses real XTAL tokens. Testnet and Regtest are for testing only.
      </p>
    </div>
  );
}
