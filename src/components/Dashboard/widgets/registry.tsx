import type { ComponentType } from "react";
import {
  Activity,
  ArrowDownLeft,
  Blocks,
  Cherry,
  Coins,
  FileCode2,
  Globe,
  Layers,
  Leaf,
  Shield,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { WidgetShellProps } from "@/components/Dashboard/WidgetShell";
import type { DashboardWidget, WidgetSize } from "@/types/dashboard";
import { isWidgetSize } from "@/types/dashboard";

import BestLeafWidget from "./BestLeafWidget";
import ContractValueWidget from "./ContractValueWidget";
import FruitProductionWidget from "./FruitProductionWidget";
import IncomingTransactionsWidget from "./IncomingTransactionsWidget";
import LeafHeightWidget from "./LeafHeightWidget";
import MempoolWidget from "./MempoolWidget";
import MiningWidget from "./MiningWidget";
import PeersWidget from "./PeersWidget";
import SyncProgressWidget from "./SyncProgressWidget";
import ValidatorEarningsWidget from "./ValidatorEarningsWidget";
import ValidatorNetworkWidget from "./ValidatorNetworkWidget";
import ValidatorWidget from "./ValidatorWidget";
import WalletBalanceWidget from "./WalletBalanceWidget";

export interface WidgetProps {
  widget: DashboardWidget;
  /** Resolved size preset (unknown persisted values already mapped). */
  size: WidgetSize;
  /** Edit-mode chrome from DashboardGrid; spread onto the WidgetShell. */
  shellProps: Partial<WidgetShellProps>;
}

export interface WidgetDefinition {
  type: string;
  /** Header + add-picker label, uppercase per dashboard convention. */
  title: string;
  icon: LucideIcon;
  /** Add-picker subtitle. */
  description: string;
  defaultSize: WidgetSize;
  allowedSizes: WidgetSize[];
  /** May appear multiple times in one layout (per-instance config). */
  multiInstance?: boolean;
  /** Needs a configuration step in the add-widget dialog. */
  requiresConfig?: boolean;
  component: ComponentType<WidgetProps>;
}

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  leaf_height: {
    type: "leaf_height",
    title: "LEAF HEIGHT",
    icon: Blocks,
    description: "Finalized chain height and stems since the last leaf",
    defaultSize: "s",
    allowedSizes: ["s", "m", "l", "xl"],
    component: LeafHeightWidget,
  },
  peers: {
    type: "peers",
    title: "CONNECTED PEERS",
    icon: Users,
    description: "Peer count with inbound/outbound split",
    defaultSize: "s",
    allowedSizes: ["s", "m", "l", "xl"],
    component: PeersWidget,
  },
  mempool: {
    type: "mempool",
    title: "MEMPOOL",
    icon: Layers,
    description: "Pending transaction count, size, and type split",
    defaultSize: "s",
    allowedSizes: ["s", "m", "l", "xl"],
    component: MempoolWidget,
  },
  mining: {
    type: "mining",
    title: "MINING",
    icon: Zap,
    description: "Hashrate, uptime, and blocks found",
    defaultSize: "m",
    allowedSizes: ["s", "m", "l", "xl"],
    component: MiningWidget,
  },
  validator: {
    type: "validator",
    title: "VALIDATOR",
    icon: Shield,
    description: "Stake summary and fruits produced",
    defaultSize: "m",
    allowedSizes: ["s", "m", "l", "xl"],
    component: ValidatorWidget,
  },
  sync_progress: {
    type: "sync_progress",
    title: "SYNC PROGRESS",
    icon: Activity,
    description: "Sync phase and progress; collapses when synced",
    defaultSize: "xl",
    allowedSizes: ["m", "l", "xl"],
    component: SyncProgressWidget,
  },
  best_leaf: {
    type: "best_leaf",
    title: "BEST LEAF",
    icon: Leaf,
    description: "Hash of the active chain tip",
    defaultSize: "xl",
    allowedSizes: ["m", "l", "xl"],
    component: BestLeafWidget,
  },
  wallet_balance: {
    type: "wallet_balance",
    title: "WALLET BALANCE",
    icon: Wallet,
    description: "Total balance with confirmed/pending/immature breakdown",
    defaultSize: "m",
    allowedSizes: ["s", "m", "l", "xl"],
    component: WalletBalanceWidget,
  },
  contract_value: {
    type: "contract_value",
    title: "CONTRACT VALUE",
    icon: FileCode2,
    description: "Live value from a contract read method (e.g. CAGE fees)",
    defaultSize: "m",
    allowedSizes: ["s", "m", "l", "xl"],
    multiInstance: true,
    requiresConfig: true,
    component: ContractValueWidget,
  },
  validator_earnings: {
    type: "validator_earnings",
    title: "VALIDATOR EARNINGS",
    icon: Coins,
    description: "Lifetime fruit rewards",
    defaultSize: "m",
    allowedSizes: ["s", "m", "l", "xl"],
    component: ValidatorEarningsWidget,
  },
  validator_network: {
    type: "validator_network",
    title: "VALIDATOR NETWORK",
    icon: Globe,
    description: "Network epoch, total staked, and validator count",
    defaultSize: "m",
    allowedSizes: ["m", "l", "xl"],
    component: ValidatorNetworkWidget,
  },
  fruit_production: {
    type: "fruit_production",
    title: "FRUIT PRODUCTION",
    icon: Cherry,
    description: "Per-fruit difficulty and expected production rates",
    defaultSize: "m",
    allowedSizes: ["s", "m", "l", "xl"],
    component: FruitProductionWidget,
  },
  incoming_transactions: {
    type: "incoming_transactions",
    title: "INCOMING TRANSACTIONS",
    icon: ArrowDownLeft,
    description: "Pending mempool transactions paying this wallet",
    defaultSize: "m",
    allowedSizes: ["s", "m", "l", "xl"],
    component: IncomingTransactionsWidget,
  },
};

/**
 * Resolve a widget's persisted size to a usable preset. Unknown strings (from
 * newer builds) fall back to the registry default without being rewritten.
 */
export function resolveWidgetSize(
  widget: DashboardWidget,
  definition?: WidgetDefinition
): WidgetSize {
  if (isWidgetSize(widget.size)) return widget.size;
  return definition?.defaultSize ?? "s";
}
