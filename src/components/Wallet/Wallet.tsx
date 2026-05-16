import { useState, useEffect, useRef } from "react";
import {
  Wallet as WalletIcon,
  Plus,
  Send,
  Download,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  LogOut,
  Cpu,
  Boxes,
  Key,
  FileText,
  ArrowUpFromLine,
  ArrowDownToLine,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecoveryPhraseDisplay } from "@/components/common/RecoveryPhraseDisplay";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AmountDisplay, HashDisplay, StatusBadge, TransactionList } from "@/components/common";
import { useWalletStore, useUiStore } from "@/stores";
import { tauriCommand } from "@/hooks";

import { cn } from "@/lib/utils";
import type {
  WalletBalance,
  VmAccountBalance,
  Address,
  VmAddress,
  WalletStatus,
  TransactionHistoryResponse,
  SignerImportResult,
} from "@/types";
import { MnemonicInput } from "@/components/common/MnemonicInput";
import { SendModal } from "./SendModal";
import { ReceiveModal } from "./ReceiveModal";
import { VmSendModal } from "./VmSendModal";
import { VmReceiveModal } from "./VmReceiveModal";
import { DepositModal } from "./DepositModal";
import { WithdrawModal } from "./WithdrawModal";
import { MultisigModal } from "./MultisigModal";

// Modal IDs for wallet operations (triggered by menu or buttons)
const MODAL_WALLET_LOAD = "wallet-load";
const MODAL_WALLET_CREATE = "wallet-create";
const MODAL_WALLET_IMPORT = "wallet-import";
const MODAL_WALLET_CHANGE_PASSWORD = "wallet-change-password";
const MODAL_WALLET_IMPORT_FILE = "wallet-import-file";
const MODAL_SEND = "wallet-send";
const MODAL_RECEIVE = "wallet-receive";
const MODAL_VM_SEND = "wallet-vm-send";
const MODAL_VM_RECEIVE = "wallet-vm-receive";
const MODAL_DEPOSIT = "wallet-deposit";
const MODAL_WITHDRAW = "wallet-withdraw";
const MODAL_MULTISIG = "wallet-multisig";

// Sub-tab types for the wallet view
type WalletSubTab = "utxo" | "vm";

// Import mode tabs
type ImportMode = "mnemonic" | "key";

// Response types for Tauri commands
interface WalletCreationResult {
  walletName: string;
  mnemonic: string[];
  primaryAddress: string;
  masterSeed?: string;
}

interface WalletLoadResult {
  wallet_name: string;
  primary_address: string;
}

export default function Wallet() {
  const {
    isLoaded,
    walletName,
    balance,
    addresses,
    transactions,
    transactionPagination,
    vmBalance,
    vmAddresses,
    vmTransactions,
    vmTransactionPagination,
    availableWallets,
    setBalance,
    setAddresses,
    setTransactionPage,
    setPageLoading,
    setVmBalance,
    setVmAddresses,
    addVmAddress,
    setVmTransactionPage,
    setVmPageLoading,
    setAvailableWallets,
    setLoaded,
    refreshTrigger,
  } = useWalletStore();
  const { addToast, activeModal, modalData, openModal, closeModal } = useUiStore();

  // Derive modal visibility from store
  const showLoadModal = activeModal === MODAL_WALLET_LOAD;
  const showCreateModal = activeModal === MODAL_WALLET_CREATE;
  const showImportModal = activeModal === MODAL_WALLET_IMPORT;
  const showChangePasswordModal = activeModal === MODAL_WALLET_CHANGE_PASSWORD;
  const showSendModal = activeModal === MODAL_SEND;
  const showReceiveModal = activeModal === MODAL_RECEIVE;
  const showVmSendModal = activeModal === MODAL_VM_SEND;
  const showVmReceiveModal = activeModal === MODAL_VM_RECEIVE;
  const showImportFileModal = activeModal === MODAL_WALLET_IMPORT_FILE;
  const showDepositModal = activeModal === MODAL_DEPOSIT;
  const showWithdrawModal = activeModal === MODAL_WITHDRAW;
  const showMultisigModal = activeModal === MODAL_MULTISIG;
  // For load modal, the wallet name is passed as modalData
  const selectedWalletFromMenu = showLoadModal ? (modalData as string | null) : null;

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<WalletSubTab>("utxo");

  // Modal/form state (modal visibility is controlled by uiStore.activeModal)
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [newWalletName, setNewWalletName] = useState("");
  const [createdMnemonic, setCreatedMnemonic] = useState<string[] | null>(null);
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);
  const [createdMasterSeed, setCreatedMasterSeed] = useState<string | null>(null);
  const [importProcessing, setImportProcessing] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importConfirmPassword, setImportConfirmPassword] = useState("");
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [importStep, setImportStep] = useState<"mnemonic" | "password">("mnemonic");
  const [importWords, setImportWords] = useState<string[]>([]);
  const [importWalletName, setImportWalletName] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("mnemonic");
  const [importKeyHex, setImportKeyHex] = useState("");
  const [importKeyName, setImportKeyName] = useState("");
  const [importKeyPassword, setImportKeyPassword] = useState("");
  const [importKeyConfirmPassword, setImportKeyConfirmPassword] = useState("");
  const [importKeyPasswordEnabled, setImportKeyPasswordEnabled] = useState(true);
  const [showImportKeyPassword, setShowImportKeyPassword] = useState(false);

  // File import modal state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileImportData, setFileImportData] = useState<Uint8Array | null>(null);
  const [fileImportName, setFileImportName] = useState("");
  const [fileImportPassword, setFileImportPassword] = useState("");
  const [showFileImportPassword, setShowFileImportPassword] = useState(false);
  const [fileImportStep, setFileImportStep] = useState<"file" | "password">("file");
  const [fileImportProcessing, setFileImportProcessing] = useState(false);
  const [fileImportError, setFileImportError] = useState<string | null>(null);

  // Debug: Track walletName changes
  useEffect(() => {
    console.log('[Wallet] walletName changed to:', walletName);
  }, [walletName]);

  // Check wallet status on mount only if not already loaded AND no wallet name exists
  // This prevents overwriting good state with potentially null backend response
  useEffect(() => {
    if (!isLoaded && !walletName) {
      checkWalletStatus();
    }
    fetchAvailableWallets();
  }, [isLoaded, walletName]);

  // Sync selectedWallet from menu-triggered modal open
  useEffect(() => {
    if (selectedWalletFromMenu) {
      setSelectedWallet(selectedWalletFromMenu);
    }
  }, [selectedWalletFromMenu]);

  // Set import mode when modal opens with mode data from native menu
  useEffect(() => {
    if (activeModal === MODAL_WALLET_IMPORT) {
      const data = modalData as { mode?: ImportMode } | null;
      if (data?.mode) {
        setImportMode(data.mode);
      }
    }
  }, [activeModal, modalData]);

  const fetchAvailableWallets = async () => {
    try {
      const wallets = await tauriCommand<string[]>("list_wallets");
      setAvailableWallets(wallets);
      // Immediately sync menu with fetched wallets
      await tauriCommand("sync_wallet_menu", {
        walletLoaded: isLoaded,
        availableWallets: wallets,
      });
    } catch (err) {
      console.error("Failed to list wallets:", err);
    }
  };

  const checkWalletStatus = async () => {
    console.log('[Wallet] checkWalletStatus called');
    try {
      const status = await tauriCommand<WalletStatus>("get_wallet_status");
      console.log('[Wallet] get_wallet_status returned:', status);
      setLoaded(status.is_loaded, status.wallet_name);
    } catch (err) {
      console.error("Failed to check wallet status:", err);
    }
  };

  // Refresh wallet data when wallet is loaded or wallet changes
  useEffect(() => {
    if (isLoaded && walletName) {
      refreshWalletData();
    }
  }, [isLoaded, walletName]);

  // Refresh wallet data when triggered by new blocks (via store trigger)
  useEffect(() => {
    if (refreshTrigger > 0 && isLoaded) {
      refreshWalletData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Fetch VM data when switching to VM tab
  useEffect(() => {
    if (activeSubTab === "vm" && isLoaded) {
      refreshVmData();
    }
  }, [activeSubTab, isLoaded]);

  const PAGE_SIZE = 50;

  const refreshWalletData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [balanceResult, addressesResult, txResult] = await Promise.all([
        tauriCommand<WalletBalance>("get_wallet_balance"),
        tauriCommand<Address[]>("get_addresses", { limit: 20 }),
        tauriCommand<TransactionHistoryResponse>("get_transaction_history", { limit: PAGE_SIZE, offset: 0 }),
      ]);

      setBalance(balanceResult);
      setAddresses(addressesResult);
      setTransactionPage(1, txResult.transactions, txResult.totalCount);

      // Also refresh VM data if on VM tab
      if (activeSubTab === "vm") {
        await refreshVmData();
      }
    } catch (err) {
      console.error("Failed to refresh wallet:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to refresh wallet",
        message,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshVmData = async () => {
    try {
      const [vmBalanceResult, vmAddrsResult, txResult] = await Promise.all([
        tauriCommand<VmAccountBalance>("get_vm_account_balance"),
        tauriCommand<VmAddress[]>("get_vm_addresses"),
        tauriCommand<TransactionHistoryResponse>("get_vm_transaction_history", { limit: PAGE_SIZE, offset: 0 }),
      ]);

      setVmBalance(vmBalanceResult);
      setVmAddresses(vmAddrsResult);
      setVmTransactionPage(1, txResult.transactions, txResult.totalCount);
    } catch (err) {
      console.error("Failed to refresh VM data:", err);
    }
  };

  const handleGenerateVmAddress = async () => {
    try {
      const address = await tauriCommand<string>("generate_vm_address");
      addVmAddress(address);
      // Refresh VM balance since new address may have balance
      const vmBalanceResult = await tauriCommand<VmAccountBalance>("get_vm_account_balance");
      setVmBalance(vmBalanceResult);
    } catch (err) {
      console.error("Failed to generate VM address:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to generate VM address",
        message,
        duration: 5000,
      });
    }
  };

  const fetchTransactionPage = async (page: number) => {
    setPageLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await tauriCommand<TransactionHistoryResponse>("get_transaction_history", {
        limit: PAGE_SIZE,
        offset,
      });
      setTransactionPage(page, result.transactions, result.totalCount);
    } catch (err) {
      console.error("Failed to load transactions:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to load transactions",
        message,
        duration: 5000,
      });
      setPageLoading(false);
    }
  };

  const fetchVmTransactionPage = async (page: number) => {
    setVmPageLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await tauriCommand<TransactionHistoryResponse>("get_vm_transaction_history", {
        limit: PAGE_SIZE,
        offset,
      });
      setVmTransactionPage(page, result.transactions, result.totalCount);
    } catch (err) {
      console.error("Failed to load VM transactions:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to load transactions",
        message,
        duration: 5000,
      });
      setVmPageLoading(false);
    }
  };

  const handleLoadWallet = async () => {
    if (!selectedWallet) {
      setError("No wallet selected");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await tauriCommand<WalletLoadResult>("load_wallet", {
        walletName: selectedWallet,
      });
      console.log('[Wallet] load_wallet result:', result);
      // Use selectedWallet as fallback if backend doesn't return name
      const walletNameToUse = result.wallet_name || selectedWallet;
      setLoaded(true, walletNameToUse);
      closeModal();
      setSelectedWallet(null);
    } catch (err) {
      console.error("Failed to load wallet:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to load wallet",
        message,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWallet = async () => {
    if (!newWalletName || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await tauriCommand<WalletCreationResult>("create_new_wallet", {
        walletName: newWalletName,
        password
      });
      setCreatedMnemonic(result.mnemonic);
      setCreatedAddress(result.primaryAddress);
      setCreatedMasterSeed(result.masterSeed ?? null);
      // Don't close modal yet - show mnemonic first
    } catch (err) {
      console.error("Failed to create wallet:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to create wallet",
        message,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmMnemonic = async () => {
    const createdName = newWalletName;
    closeModal();
    setCreatedMnemonic(null);
    setCreatedAddress(null);
    setCreatedMasterSeed(null);
    setNewWalletName("");
    setPassword("");
    setConfirmPassword("");
    await fetchAvailableWallets();
    addToast({
      type: "success",
      title: "Wallet created",
      message: `Wallet "${createdName}" is available to load`,
      duration: 3000,
    });
  };

  const handleImportMnemonicSubmit = (words: string[], walletName: string) => {
    setImportWords(words);
    setImportWalletName(walletName);
    setImportStep("password");
  };

  const handleImportWallet = async () => {
    if (!importPassword) {
      setError("Please enter a password");
      return;
    }
    if (importPassword !== importConfirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (importPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setImportProcessing(true);
    setError(null);
    try {
      const mnemonic = importWords.join(" ");
      await tauriCommand<WalletCreationResult>("import_wallet", {
        walletName: importWalletName,
        password: importPassword,
        mnemonic,
      });
      closeModal();
      // Reset import state
      setImportStep("mnemonic");
      setImportWords([]);
      setImportWalletName("");
      setImportPassword("");
      setImportConfirmPassword("");
      // Refresh wallet list
      await fetchAvailableWallets();
      addToast({
        type: "success",
        title: "Wallet imported",
        message: `Wallet "${importWalletName}" is available to load`,
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to import wallet:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to import wallet",
        message,
        duration: 5000,
      });
    } finally {
      setImportProcessing(false);
    }
  };

  const isValidHex = (s: string) => /^[0-9a-fA-F]*$/.test(s);

  const handleImportRawKey = async () => {
    if (!importKeyName.trim()) {
      setError("Please enter a wallet name");
      return;
    }
    if (importKeyHex.length !== 64 || !isValidHex(importKeyHex)) {
      setError("Private key must be exactly 64 hex characters");
      return;
    }
    if (importKeyPasswordEnabled) {
      if (!importKeyPassword) {
        setError("Please enter a password");
        return;
      }
      if (importKeyPassword !== importKeyConfirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (importKeyPassword.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
    }

    setImportProcessing(true);
    setError(null);
    try {
      const password = importKeyPasswordEnabled ? importKeyPassword : "";
      const result = await tauriCommand<SignerImportResult>("import_raw_key", {
        walletName: importKeyName,
        password,
        privateKeyHex: importKeyHex,
      });
      closeModal();
      // Reset import state
      setImportMode("mnemonic");
      setImportKeyHex("");
      setImportKeyName("");
      setImportKeyPassword("");
      setImportKeyConfirmPassword("");
      setImportKeyPasswordEnabled(true);
      setShowImportKeyPassword(false);
      // Refresh wallet list
      await fetchAvailableWallets();
      addToast({
        type: "success",
        title: "Key imported",
        message: `Signer wallet "${result.wallet_name}" is available to load`,
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to import raw key:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to import key",
        message,
        duration: 5000,
      });
    } finally {
      setImportProcessing(false);
    }
  };

  // --- File import handlers ---

  const resetFileImportForm = () => {
    setFileImportData(null);
    setFileImportName("");
    setFileImportPassword("");
    setShowFileImportPassword(false);
    setFileImportStep("file");
    setFileImportProcessing(false);
    setFileImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleBrowseWalletFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Auto-fill wallet name from filename if empty
    if (!fileImportName) {
      const basename = file.name.replace(/\.enc$/, "");
      setFileImportName(basename);
    }

    // Read file as ArrayBuffer and convert to Uint8Array
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        setFileImportData(new Uint8Array(arrayBuffer));
      }
    };
    reader.onerror = () => {
      setFileImportError("Failed to read file. Please try again.");
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportWalletFromFile = async () => {
    if (!fileImportData) {
      setFileImportError("No file data available");
      return;
    }
    if (!fileImportPassword) {
      setFileImportError("Please enter the file password");
      return;
    }

    setFileImportProcessing(true);
    setFileImportError(null);
    try {
      await tauriCommand<WalletCreationResult>("import_wallet_from_file", {
        walletName: fileImportName,
        fileData: Array.from(fileImportData), // Convert Uint8Array to number[]
        password: fileImportPassword,
      });
      closeModal();
      resetFileImportForm();
      await fetchAvailableWallets();
      addToast({
        type: "success",
        title: "Wallet imported",
        message: `Wallet "${fileImportName}" is available to load`,
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to import wallet from file:", err);
      const message = err instanceof Error ? err.message : String(err);
      setFileImportError(message);
    } finally {
      setFileImportProcessing(false);
    }
  };

  const openLoadModal = (name: string) => {
    setSelectedWallet(name);
    openModal(MODAL_WALLET_LOAD, name);
    setError(null);
  };

  const handleUnloadWallet = async () => {
    setIsLoading(true);
    try {
      await tauriCommand("unload_wallet");
      setLoaded(false, null);
      // Reset wallet data
      setBalance({ total: 0, confirmed: 0, pending: 0, immature: 0 });
      setAddresses([]);
      setTransactionPage(1, [], 0);
      // Refresh available wallets list
      await fetchAvailableWallets();
      addToast({
        type: "success",
        title: "Wallet unloaded",
        message: "Your wallet has been unloaded",
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to unload wallet:", err);
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to unload wallet",
        message,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetChangePasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setNewConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setError(null);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !newConfirmPassword) {
      setError("Please fill in all fields");
      return;
    }
    if (newPassword !== newConfirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from current password");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await tauriCommand("change_password", {
        request: {
          currentPassword,
          newPassword,
        },
      });
      closeModal();
      resetChangePasswordForm();
      addToast({
        type: "success",
        title: "Password updated",
        message: "Wallet password changed successfully",
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to change wallet password:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Note: Menu events (menu:unload_wallet, etc.) are now
  // handled in App.tsx to ensure they work regardless of which tab is active.

  // Sync menu state with wallet state
  useEffect(() => {
    tauriCommand("sync_wallet_menu", {
      walletLoaded: isLoaded,
      availableWallets: availableWallets,
    }).catch((err) => {
      console.error("Failed to sync wallet menu:", err);
    });
  }, [isLoaded, availableWallets]);

  // =========================================================================
  // Sub-tab content renderers
  // =========================================================================

  const renderUtxoContent = () => (
    <>
      {/* Balance Card */}
      <Card variant="crystalline" className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm font-heading tracking-wide text-foreground-secondary mb-2">
              AVAILABLE BALANCE
            </p>
            <AmountDisplay amount={balance.confirmed} size="xl" showSymbol />
            {/* Show immature row when there are pending or immature funds */}
            {(balance.pending + balance.immature > 0) && (
              <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                <div>
                  <p className="text-foreground-muted font-heading text-xs">IMMATURE</p>
                  <AmountDisplay amount={balance.pending + balance.immature} size="sm" showSymbol={false} />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="crystalline"
          size="lg"
          className="h-14 text-foreground"
          onClick={() => openModal(MODAL_SEND)}
        >
          <Send className="h-4 w-4 mr-1.5" />
          Send
        </Button>
        <Button
          size="lg"
          variant="outline-crystalline"
          className="h-14 text-foreground"
          onClick={() => openModal(MODAL_RECEIVE)}
        >
          <Download className="h-4 w-4 mr-1.5" />
          Receive
        </Button>
        <Button
          size="lg"
          variant="outline-crystalline"
          className="h-14 text-foreground"
          onClick={() => openModal(MODAL_DEPOSIT)}
        >
          <ArrowUpFromLine className="h-4 w-4 mr-1.5" />
          Deposit
        </Button>
      </div>

      {/* Addresses */}
      <Card variant="crystalline">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-heading tracking-wide">ADDRESSES</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => openModal(MODAL_MULTISIG)}>
                <ShieldCheck className="h-4 w-4 mr-1" />
                Multisig
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openModal(MODAL_RECEIVE)}>
                <Plus className="h-4 w-4 mr-1" />
                New Address
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <p className="text-center text-foreground-muted py-4 font-heading">
              No addresses yet
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {addresses.map((addr) => (
                <div
                  key={addr.address}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50",
                    addr.kind === "validator" && "validator-address-row"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {addr.kind === "validator" && (
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    )}
                    <HashDisplay hash={addr.address} truncate={false} showTooltip={false} />
                    {addr.label && (
                      <Badge variant="outline" shape="chamfered" className="text-xs">
                        {addr.label}
                      </Badge>
                    )}
                    {addr.kind === "validator" && (
                      <Badge variant="secondary" shape="chamfered" className="text-xs">
                        Validator
                      </Badge>
                    )}
                  </div>
                  <Badge variant={addr.used ? "secondary" : "success"} shape="chamfered" diamond>
                    {addr.used ? "Used" : "Fresh"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <TransactionList
        transactions={transactions}
        surface="utxo"
        title="TRANSACTIONS"
        currentPage={transactionPagination.currentPage}
        totalPages={Math.ceil(transactionPagination.totalCount / transactionPagination.pageSize)}
        isLoading={transactionPagination.isLoading}
        onPageChange={fetchTransactionPage}
      />
    </>
  );

  const renderVmContent = () => (
    <>
      {/* VM Balance Card */}
      <Card variant="crystalline" className="bg-gradient-to-br from-accent/10 to-primary/10 border-accent/20">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm font-heading tracking-wide text-foreground-secondary mb-2">
              VM ACCOUNT BALANCE
            </p>
            <AmountDisplay
              amount={vmBalance?.balance ?? 0}
              size="xl"
              showSymbol
            />
            {vmBalance && vmBalance.nonce > 0 && (
              <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                <div>
                  <p className="text-foreground-muted font-heading text-xs">NONCE</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {vmBalance.nonce}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="crystalline"
          size="lg"
          className="h-14 text-foreground"
          onClick={() => openModal(MODAL_VM_SEND)}
          disabled={vmAddresses.length === 0}
        >
          <Send className="h-4 w-4 mr-1.5" />
          Send
        </Button>
        <Button
          size="lg"
          variant="outline-crystalline"
          className="h-14 text-foreground"
          onClick={() => openModal(MODAL_VM_RECEIVE)}
        >
          <Download className="h-4 w-4 mr-1.5" />
          Receive
        </Button>
        <Button
          size="lg"
          variant="outline-crystalline"
          className="h-14 text-foreground"
          onClick={() => openModal(MODAL_WITHDRAW)}
          disabled={vmAddresses.length === 0}
        >
          <ArrowDownToLine className="h-4 w-4 mr-1.5" />
          Withdraw
        </Button>
      </div>

      {/* VM Addresses */}
      <Card variant="crystalline">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-heading tracking-wide">VM ADDRESSES</CardTitle>
            <Button variant="ghost" size="sm" onClick={handleGenerateVmAddress}>
              <Plus className="h-4 w-4 mr-1" />
              New Address
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {vmAddresses.length === 0 ? (
            <p className="text-center text-foreground-muted py-4 font-heading">
              No VM addresses yet
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {vmAddresses.map((addr) => (
                <div
                  key={addr.address}
                  className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <HashDisplay hash={addr.address} truncate={false} showTooltip={false} />
                    {addr.label && (
                      <Badge variant="outline" shape="chamfered" className="text-xs shrink-0">
                        {addr.label}
                      </Badge>
                    )}
                  </div>
                  <Badge variant="info" shape="chamfered" diamond className="shrink-0">
                    Account
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* VM Transaction History */}
      <TransactionList
        transactions={vmTransactions}
        surface="vm"
        title="VM TRANSACTIONS"
        currentPage={vmTransactionPagination.currentPage}
        totalPages={Math.ceil(vmTransactionPagination.totalCount / vmTransactionPagination.pageSize) || 1}
        isLoading={vmTransactionPagination.isLoading}
        onPageChange={fetchVmTransactionPage}
      />
    </>
  );

  // Render content based on wallet state, with modals always available
  const renderContent = () => {
    // No wallet loaded state
    if (!isLoaded) {
      return (
        <div className="space-y-6 animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">WALLET</h1>
            <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
              Manage your XTAL balance
            </p>
          </div>

          <Card variant="crystalline" className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="icon-hex mx-auto mb-4 bg-primary/20" style={{ width: '4rem', height: '4rem' }}>
                <WalletIcon className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="font-heading tracking-wide">NO WALLET LOADED</CardTitle>
              <CardDescription>
                Load an existing wallet or create a new one to get started
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {availableWallets.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Available Wallets</p>
                  {availableWallets.map((name) => (
                    <Button
                      key={name}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => openLoadModal(name)}
                    >
                      <WalletIcon className="h-4 w-4 mr-2" />
                      {name}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-muted text-center">
                  No wallets found
                </p>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => openModal(MODAL_WALLET_CREATE)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => openModal(MODAL_WALLET_IMPORT)}>
                  <Download className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Wallet loaded - return the main wallet UI with sub-tabs
    return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">WALLET</h1>
            <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
              {walletName}
            </p>
          </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="mt-1">
              <ChevronDown className="h-4 w-4 text-foreground" />
            </Button>
          </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Current Wallet</DropdownMenuLabel>
              <DropdownMenuItem disabled className="opacity-70">
                <CheckCircle className="h-4 w-4 mr-2 text-success" />
                {walletName}
              </DropdownMenuItem>

              {availableWallets.filter(w => w !== walletName).length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Switch Wallet</DropdownMenuLabel>
                  {availableWallets
                    .filter(w => w !== walletName)
                    .map((name) => (
                      <DropdownMenuItem key={name} onClick={() => openLoadModal(name)}>
                        <WalletIcon className="h-4 w-4 mr-2" />
                        {name}
                      </DropdownMenuItem>
                    ))}
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openModal(MODAL_WALLET_CREATE)}>
                <Plus className="h-4 w-4 mr-2" />
                Create New Wallet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                openModal(MODAL_WALLET_CHANGE_PASSWORD);
                setError(null);
              }}>
                <Key className="h-4 w-4 mr-2" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleUnloadWallet} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Unload Wallet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2">
          {/* Total Balance Readout */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-heading tracking-wide text-foreground-muted">TOTAL</span>
            <AmountDisplay 
              amount={balance.confirmed + (vmBalance?.balance ?? 0)} 
              size="sm" 
              showSymbol 
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={refreshWalletData}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <StatusBadge status="online" />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 chamfered-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex gap-1 p-1 bg-muted/50 chamfered-sm">
        <button
          onClick={() => setActiveSubTab("utxo")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 chamfered-sm",
            "font-heading text-sm tracking-wide transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeSubTab === "utxo"
              ? "bg-primary/15 text-primary shadow-inner-glow"
              : "text-foreground-secondary hover:text-foreground hover:bg-muted/80"
          )}
        >
          <Boxes className="h-4 w-4" />
          UTXO
        </button>
        <button
          onClick={() => setActiveSubTab("vm")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 chamfered-sm",
            "font-heading text-sm tracking-wide transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeSubTab === "vm"
              ? "bg-accent/15 text-accent shadow-inner-glow"
              : "text-foreground-secondary hover:text-foreground hover:bg-muted/80"
          )}
        >
          <Cpu className="h-4 w-4" />
          VM
        </button>
      </div>

      {/* Sub-tab Content */}
      <div key={activeSubTab}>
        {activeSubTab === "utxo" ? renderUtxoContent() : renderVmContent()}
      </div>
    </div>
    );
  };

  // Main return - renders content with modals always available
  return (
    <>
      {renderContent()}

      {/* Load Wallet Modal - simple confirmation, no password required */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start min-[900px]:items-center justify-center z-50 overflow-y-auto p-3 sm:p-4">
          <Card variant="crystalline" className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading tracking-wide">LOAD WALLET</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => closeModal()}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>Load wallet "{selectedWallet}"</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
              <p className="text-sm text-foreground-muted">
                Your wallet will be loaded in view-only mode. Password is only required when sending transactions.
              </p>
              <Button
                className="w-full"
                onClick={handleLoadWallet}
                disabled={isLoading}
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <WalletIcon className="h-4 w-4 mr-2" />
                )}
                Load Wallet
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Wallet Modal - always rendered regardless of wallet state */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start min-[900px]:items-center justify-center z-50 overflow-y-auto p-3 sm:p-4 text-foreground">
          <Card variant="crystalline" className={cn(
            "w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto",
            createdMnemonic ? "max-w-lg" : "max-w-md"
          )}>
            {createdMnemonic ? (
              /* Mnemonic display — wider card, no header, matches validator pattern */
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <CardTitle className="font-heading tracking-wide">BACKUP RECOVERY PHRASE</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => {
                    closeModal();
                    setCreatedMnemonic(null);
                    setCreatedAddress(null);
                    setCreatedMasterSeed(null);
                    setNewWalletName("");
                    setPassword("");
                    setConfirmPassword("");
                    setError(null);
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <RecoveryPhraseDisplay
                  mnemonic={createdMnemonic}
                  publicKey={createdAddress ?? ''}
                  masterSeed={createdMasterSeed ?? undefined}
                  onConfirm={handleConfirmMnemonic}
                  showConfirmCheckbox={false}
                />
              </CardContent>
            ) : (
              /* Create form — narrower card with header */
              <>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading tracking-wide">CREATE NEW WALLET</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => {
                  closeModal();
                  setCreatedMnemonic(null);
                  setCreatedAddress(null);
                  setCreatedMasterSeed(null);
                  setNewWalletName("");
                  setPassword("");
                  setConfirmPassword("");
                  setError(null);
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => { e.preventDefault(); handleCreateWallet(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading && newWalletName && password && confirmPassword) {
                    e.preventDefault();
                    handleCreateWallet();
                  }
                }}
              >
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
              <CardDescription>
                Create a new wallet with a secure password
              </CardDescription>
              <Input
                placeholder="Wallet name"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
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
              </>
            )}
          </Card>
        </div>
      )}

      {/* Import Wallet Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start min-[900px]:items-center justify-center z-50 overflow-y-auto p-3 sm:p-4 text-foreground">
          <Card variant="crystalline" className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading tracking-wide">
                  {importMode === "mnemonic"
                    ? (importStep === "mnemonic" ? "IMPORT WALLET" : "SET PASSWORD")
                    : "IMPORT PRIVATE KEY"
                  }
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => {
                  closeModal();
                  setImportMode("mnemonic");
                  setImportStep("mnemonic");
                  setImportWords([]);
                  setImportWalletName("");
                  setImportPassword("");
                  setImportConfirmPassword("");
                  setImportKeyHex("");
                  setImportKeyName("");
                  setImportKeyPassword("");
                  setImportKeyConfirmPassword("");
                  setImportKeyPasswordEnabled(true);
                  setShowImportKeyPassword(false);
                  setError(null);
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {importMode === "mnemonic" && (
                <CardDescription>
                  {importStep === "mnemonic"
                    ? "Enter your 12-word recovery phrase to import a wallet"
                    : `Set a password for "${importWalletName}"`
                  }
                </CardDescription>
              )}
              {importMode === "key" && (
                <CardDescription>
                  Import a raw Ed25519 private key as a signer wallet
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Import Mode Tab Switcher */}
              {(importMode === "key" || importStep === "mnemonic") && (
                <div className="flex gap-1 p-1 bg-muted/50 chamfered-sm">
                  <button
                    onClick={() => { setImportMode("mnemonic"); setError(null); }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 chamfered-sm",
                      "font-heading text-xs tracking-wide transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      importMode === "mnemonic"
                        ? "bg-primary/15 text-primary shadow-inner-glow"
                        : "text-foreground-secondary hover:text-foreground hover:bg-muted/80"
                    )}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Recovery Phrase
                  </button>
                  <button
                    onClick={() => { setImportMode("key"); setError(null); }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 chamfered-sm",
                      "font-heading text-xs tracking-wide transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      importMode === "key"
                        ? "bg-accent/15 text-accent shadow-inner-glow"
                        : "text-foreground-secondary hover:text-foreground hover:bg-muted/80"
                    )}
                  >
                    <Key className="h-3.5 w-3.5" />
                    Private Key
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {/* Recovery Phrase Tab */}
              {importMode === "mnemonic" && (
                <>
                  {importStep === "mnemonic" ? (
                    <MnemonicInput
                      onSubmit={handleImportMnemonicSubmit}
                      isProcessing={false}
                      submitLabel="Continue"
                      processingLabel="Processing..."
                      autoFocus
                    />
                  ) : (
                    <form
                      className="space-y-4"
                      onSubmit={(e) => { e.preventDefault(); handleImportWallet(); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !importProcessing && importPassword && importConfirmPassword) {
                          e.preventDefault();
                          handleImportWallet();
                        }
                      }}
                    >
                      <div className="relative">
                        <Input
                          type={showImportPassword ? "text" : "password"}
                          placeholder="Password (min 8 characters)"
                          value={importPassword}
                          onChange={(e) => setImportPassword(e.target.value)}
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          onClick={() => setShowImportPassword(!showImportPassword)}
                          tabIndex={-1}
                        >
                          {showImportPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Input
                        type={showImportPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        value={importConfirmPassword}
                        onChange={(e) => setImportConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          type="button"
                          className="flex-1"
                          onClick={() => {
                            setImportStep("mnemonic");
                            setImportPassword("");
                            setImportConfirmPassword("");
                            setError(null);
                          }}
                          disabled={importProcessing}
                        >
                          Back
                        </Button>
                        <Button
                          type="submit"
                          className="flex-1"
                          disabled={importProcessing || !importPassword || !importConfirmPassword}
                        >
                          {importProcessing ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          Import Wallet
                        </Button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {/* Private Key Tab */}
              {importMode === "key" && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => { e.preventDefault(); handleImportRawKey(); }}
                >
                  <Input
                    placeholder="Wallet name"
                    value={importKeyName}
                    onChange={(e) => setImportKeyName(e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                  />
                  <div>
                    <Input
                      placeholder="Ed25519 private key (64 hex characters)"
                      value={importKeyHex}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\s/g, "");
                        if (val === "" || /^[0-9a-fA-F]*$/.test(val)) {
                          setImportKeyHex(val.slice(0, 64));
                        }
                      }}
                      className={cn(
                        "font-mono text-sm",
                        importKeyHex.length > 0 && importKeyHex.length < 64 && "border-warning/50",
                        importKeyHex.length === 64 && "border-success/50"
                      )}
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                    <div className="flex justify-between mt-1.5 px-0.5">
                      <span className={cn(
                        "text-xs",
                        importKeyHex.length === 0
                          ? "text-foreground-muted"
                          : importKeyHex.length === 64
                            ? "text-success"
                            : "text-foreground-secondary"
                      )}>
                        {importKeyHex.length}/64 characters
                      </span>
                      {importKeyHex.length === 64 && (
                        <span className="text-xs text-success flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Valid length
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Password toggle */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-foreground-secondary">Password protection</label>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" shape="chamfered" className="text-xs">
                          Recommended
                        </Badge>
                        <button
                          type="button"
                          onClick={() => {
                            setImportKeyPasswordEnabled(!importKeyPasswordEnabled);
                            if (importKeyPasswordEnabled) {
                              setImportKeyPassword("");
                              setImportKeyConfirmPassword("");
                            }
                          }}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full",
                            "border-2 border-transparent transition-colors duration-200",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            importKeyPasswordEnabled ? "bg-primary" : "bg-muted"
                          )}
                        >
                          <span className={cn(
                            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg",
                            "ring-0 transition-transform duration-200",
                            importKeyPasswordEnabled ? "translate-x-4" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                    </div>

                    {importKeyPasswordEnabled && (
                      <>
                        <div className="relative">
                          <Input
                            type={showImportKeyPassword ? "text" : "password"}
                            placeholder="Password (min 8 characters)"
                            value={importKeyPassword}
                            onChange={(e) => setImportKeyPassword(e.target.value)}
                            autoComplete="new-password"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            onClick={() => setShowImportKeyPassword(!showImportKeyPassword)}
                            tabIndex={-1}
                          >
                            {showImportKeyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <Input
                          type={showImportKeyPassword ? "text" : "password"}
                          placeholder="Confirm password"
                          value={importKeyConfirmPassword}
                          onChange={(e) => setImportKeyConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      importProcessing ||
                      !importKeyName.trim() ||
                      importKeyHex.length !== 64 ||
                      (importKeyPasswordEnabled && (!importKeyPassword || !importKeyConfirmPassword))
                    }
                  >
                    {importProcessing ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4 mr-2" />
                    )}
                    Import Key
                  </Button>

                  <p className="text-xs text-foreground-muted text-center">
                    Your private key is encrypted locally and never leaves this device.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Import Wallet from File Modal */}
      {showImportFileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start min-[900px]:items-center justify-center z-50 overflow-y-auto p-3 sm:p-4 text-foreground">
          <Card variant="crystalline" className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading tracking-wide">
                  {fileImportStep === "file" ? "IMPORT FROM FILE" : "ENTER PASSWORD"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => {
                  closeModal();
                  resetFileImportForm();
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                {fileImportStep === "file"
                  ? "Select an encrypted wallet file (.enc) to import"
                  : `Decrypt and import "${fileImportName}"`
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fileImportError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {fileImportError}
                </div>
              )}

              {fileImportStep === "file" ? (
                <>
                  <Input
                    placeholder="Wallet name"
                    value={fileImportName}
                    onChange={(e) => setFileImportName(e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                  />

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".enc"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />

                  <div className="flex gap-2">
                    <Input
                      placeholder="No file selected"
                      value={fileImportData ? "File loaded (click Browse to change)" : ""}
                      readOnly
                      className="font-mono text-sm flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBrowseWalletFile}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Browse
                    </Button>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!fileImportName.trim()) {
                        setFileImportError("Please enter a wallet name");
                        return;
                      }
                      if (!fileImportData) {
                        setFileImportError("Please select a wallet file");
                        return;
                      }
                      setFileImportError(null);
                      setFileImportStep("password");
                    }}
                    disabled={!fileImportName.trim() || !fileImportData}
                  >
                    Continue
                  </Button>
                </>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(e) => { e.preventDefault(); handleImportWalletFromFile(); }}
                >
                  <p className="text-xs text-foreground-muted">
                    Enter the password used to encrypt the original wallet file.
                  </p>

                  <div className="relative">
                    <Input
                      type={showFileImportPassword ? "text" : "password"}
                      placeholder="File password"
                      value={fileImportPassword}
                      onChange={(e) => setFileImportPassword(e.target.value)}
                      autoComplete="current-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowFileImportPassword(!showFileImportPassword)}
                      tabIndex={-1}
                    >
                      {showFileImportPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setFileImportStep("file");
                        setFileImportError(null);
                      }}
                      disabled={fileImportProcessing}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={fileImportProcessing || !fileImportPassword}
                    >
                      {fileImportProcessing ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Import Wallet
                    </Button>
                  </div>

                  <p className="text-xs text-foreground-muted text-center">
                    Your wallet file is copied locally and never leaves this device.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start min-[900px]:items-center justify-center z-50 overflow-y-auto p-3 sm:p-4 text-foreground">
          <Card variant="crystalline" className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading tracking-wide">CHANGE PASSWORD</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    closeModal();
                    resetChangePasswordForm();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                Update the password for {walletName ? `"${walletName}"` : "the loaded wallet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleChangePassword();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading && currentPassword && newPassword && newConfirmPassword) {
                    e.preventDefault();
                    handleChangePassword();
                  }
                }}
              >
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="New password (min 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={newConfirmPassword}
                  onChange={(e) => setNewConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !currentPassword || !newPassword || !newConfirmPassword}
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Send Modal */}
      <SendModal
        isOpen={showSendModal}
        onClose={closeModal}
        maxBalance={balance.confirmed}
      />

      {/* Receive Modal */}
      <ReceiveModal
        isOpen={showReceiveModal}
        onClose={closeModal}
        addresses={addresses}
        onAddressGenerated={refreshWalletData}
      />

      {/* Multisig Modal */}
      <MultisigModal
        isOpen={showMultisigModal}
        onClose={closeModal}
        onAddressCreated={refreshWalletData}
      />

      {/* VM Send Modal */}
      <VmSendModal
        isOpen={showVmSendModal}
        onClose={closeModal}
        maxBalance={vmBalance?.balance ?? 0}
      />

      {/* VM Receive Modal */}
      <VmReceiveModal
        isOpen={showVmReceiveModal}
        onClose={closeModal}
        vmAddresses={vmAddresses}
        onAddressGenerated={refreshVmData}
      />

      {/* CAGE Deposit Modal (UTXO -> VM) */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={closeModal}
      />

      {/* CAGE Withdraw Modal (VM -> UTXO) */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={closeModal}
        maxBalance={vmBalance?.balance ?? 0}
        defaultRecipient={addresses.length > 0 ? addresses[0].address : undefined}
      />
    </>
  );
}
