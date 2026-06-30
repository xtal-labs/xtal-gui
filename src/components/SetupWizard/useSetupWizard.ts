import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Types
export type WizardStep =
  | 'welcome'
  | 'network'
  // 'node-type' removed temporarily - can be re-added later
  | 'wallet-choice'
  | 'wallet-create'
  | 'mnemonic'
  | 'wallet-import-mnemonic'
  | 'wallet-import-password'
  | 'complete';

export type WalletChoice = 'create' | 'import' | 'skip' | null;
export type SyncModeOption = 'fast' | 'full';

export interface NetworkInfo {
  id: string;
  name: string;
  description: string;
}

export interface InitResult {
  network: string;
  data_dir: string;
}

export interface WalletCreationResult {
  wallet_name: string;
  mnemonic: string[];
  primary_address: string;
  master_seed?: string;
}

export interface WizardState {
  step: WizardStep;
  network: NetworkInfo | null;
  walletChoice: WalletChoice;
  walletName: string;
  walletAddress: string;
  mnemonic: string[];
  masterSeed: string;
  dataDir: string;
  isProcessing: boolean;
  error: string | null;
  backupConfirmed: boolean;
  importWalletName: string;
  selectedFruits: string[];
  archival: boolean;
  txIndex: boolean;
  syncMode: SyncModeOption;
  // True until the initial active-network pointer check resolves. Prevents a
  // flash of the welcome step when a network is already pending (switch flow).
  initializing: boolean;
}

const CREATE_STEP_ORDER: WizardStep[] = [
  'welcome',
  'network',
  // 'node-type' removed temporarily
  'wallet-choice',
  'wallet-create',
  'mnemonic',
  'complete'
];

const IMPORT_STEP_ORDER: WizardStep[] = [
  'welcome',
  'network',
  // 'node-type' removed temporarily
  'wallet-choice',
  'wallet-import-mnemonic',
  'wallet-import-password',
  'complete'
];

const initialState: WizardState = {
  step: 'welcome',
  network: null,
  walletChoice: null,
  walletName: '',
  walletAddress: '',
  mnemonic: [],
  masterSeed: '',
  dataDir: '',
  isProcessing: false,
  error: null,
  backupConfirmed: false,
  importWalletName: '',
  selectedFruits: ['Grape', 'Kiwi', 'Apple', 'Pineapple', 'Watermelon', 'Pear', 'Orange', 'Peach', 'Strawberry'],
  archival: true,
  txIndex: false,
  syncMode: 'full',
  initializing: true,
};

export function useSetupWizard() {
  const [state, setState] = useState<WizardState>(initialState);

  const setError = useCallback((error: string | null) => {
    setState(s => ({ ...s, error, isProcessing: false }));
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setState(s => ({ ...s, step, error: null }));
  }, []);

  const goBack = useCallback(() => {
    const stepOrder = state.walletChoice === 'import' ? IMPORT_STEP_ORDER : CREATE_STEP_ORDER;
    const currentIndex = stepOrder.indexOf(state.step);
    if (currentIndex > 0) {
      let prevStep = stepOrder[currentIndex - 1];

      // Skip wallet-create and mnemonic if going back and wallet was skipped
      if (prevStep === 'mnemonic' && state.walletChoice !== 'create') {
        prevStep = 'wallet-choice';
      }
      if (prevStep === 'wallet-create' && state.walletChoice !== 'create') {
        prevStep = 'wallet-choice';
      }

      setState(s => ({ ...s, step: prevStep, error: null }));
    }
  }, [state.step, state.walletChoice]);

  const selectNetwork = useCallback(async (network: NetworkInfo) => {
    setState(s => ({ ...s, isProcessing: true, error: null }));

    try {
      const result = await invoke<InitResult>('initialize_node', {
        network: network.id
      });

      setState(s => ({
        ...s,
        network,
        dataDir: result.data_dir,
        // 'node-type' step removed - go directly to wallet-choice
        step: 'wallet-choice' as WizardStep,
        isProcessing: false,
      }));
    } catch (e) {
      setError(String(e));
    }
  }, [setError]);

  // 'node-type' step removed temporarily - kept for later re-integration
  // const selectNodeType is no longer called from the wizard flow
  const selectNodeType = useCallback(async (fruits: string[], archival: boolean, txIndex: boolean, syncMode: SyncModeOption) => {
    setState(s => ({ ...s, isProcessing: true, error: null }));

    try {
      await invoke('set_node_config', { fruits, archival, txIndex, syncMode });
      setState(s => ({
        ...s,
        selectedFruits: fruits,
        archival,
        txIndex,
        syncMode,
        step: 'wallet-choice' as WizardStep,
        isProcessing: false,
      }));
    } catch (e) {
      setError(String(e));
    }
  }, [setError]);

  const selectWalletChoice = useCallback((choice: WalletChoice) => {
    setState(s => ({ ...s, walletChoice: choice, error: null }));

    if (choice === 'create') {
      setState(s => ({ ...s, step: 'wallet-create' }));
    } else if (choice === 'import') {
      setState(s => ({ ...s, step: 'wallet-import-mnemonic' }));
    } else if (choice === 'skip') {
      setState(s => ({ ...s, step: 'complete' }));
    }
  }, []);

  const createWallet = useCallback(async (walletName: string, password: string) => {
    if (!state.network) {
      setError('No network selected');
      return;
    }

    setState(s => ({ ...s, isProcessing: true, error: null, walletName }));

    try {
      const result = await invoke<WalletCreationResult>('create_setup_wallet', {
        network: state.network.id,
        walletName,
        password,
      });

      setState(s => ({
        ...s,
        walletName: result.wallet_name,
        walletAddress: result.primary_address,
        mnemonic: result.mnemonic,
        masterSeed: result.master_seed ?? '',
        step: 'mnemonic',
        isProcessing: false,
      }));
    } catch (e) {
      setError(String(e));
    }
  }, [state.network, setError]);

  const confirmBackup = useCallback(async () => {
    setState(s => ({ ...s, isProcessing: true, error: null }));

    try {
      await invoke('confirm_backup', { confirmed: true });
      setState(s => ({
        ...s,
        backupConfirmed: true,
        step: 'complete',
        isProcessing: false,
      }));
    } catch (e) {
      setError(String(e));
    }
  }, [setError]);

  const importWallet = useCallback(async (words: string[], walletName: string) => {
    if (!state.network) {
      setError('No network selected');
      return;
    }

    setState(s => ({ ...s, isProcessing: true, error: null }));

    try {
      const result = await invoke<WalletCreationResult>('import_setup_wallet', {
        network: state.network.id,
        walletName,
        mnemonic: words.join(' '),
      });

      setState(s => ({
        ...s,
        walletName: result.wallet_name,
        walletAddress: result.primary_address,
        mnemonic: result.mnemonic,
        masterSeed: result.master_seed ?? '',
        importWalletName: walletName,
        step: 'wallet-import-password',
        isProcessing: false,
      }));
    } catch (e) {
      setError(String(e));
    }
  }, [state.network, setError]);

  const setImportPassword = useCallback(async (password: string) => {
    if (!state.network) {
      setError('No network selected');
      return;
    }

    setState(s => ({ ...s, isProcessing: true, error: null }));

    try {
      await invoke('change_wallet_password', {
        network: state.network.id,
        walletName: state.importWalletName,
        oldPassword: '',
        newPassword: password,
      });

      setState(s => ({
        ...s,
        step: 'complete',
        isProcessing: false,
      }));
    } catch (e) {
      setError(String(e));
    }
  }, [state.network, state.importWalletName, setError]);

  const skipImportPassword = useCallback(() => {
    setState(s => ({ ...s, step: 'complete' }));
  }, []);

  const completeSetup = useCallback(async () => {
    setState(s => ({ ...s, isProcessing: true, error: null }));

    try {
      await invoke('complete_setup');
      // App will restart, no need to update state
    } catch (e) {
      setError(String(e));
    }
  }, [setError]);

  const getStepNumber = useCallback(() => {
    const stepOrder = state.walletChoice === 'import' ? IMPORT_STEP_ORDER : CREATE_STEP_ORDER;
    const index = stepOrder.indexOf(state.step);
    return index >= 0 ? index + 1 : 1;
  }, [state.step, state.walletChoice]);

  const getTotalSteps = useCallback(() => {
    if (state.walletChoice === 'skip') {
      // welcome, network, wallet-choice, complete (node-type removed)
      return 4;
    }
    // node-type removed from flow
    return 6;
  }, [state.walletChoice]);

  const canGoBack = useCallback(() => {
    return state.step !== 'welcome' && !state.isProcessing;
  }, [state.step, state.isProcessing]);

  // On mount, check for a pending/active network (set when the user switches to
  // an uninitialized network in Settings and is restarted into the wizard). If
  // present, pre-select it and skip straight to the wallet step. On a genuine
  // first run the pointer is unset and the normal welcome → network flow shows.
  const didBootstrap = useRef(false);
  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    (async () => {
      try {
        const pending = await invoke<NetworkInfo | null>('get_active_network');
        if (pending) {
          await selectNetwork(pending);
        }
      } catch {
        // No pointer or command unavailable — fall through to the normal flow.
      } finally {
        setState(s => ({ ...s, initializing: false }));
      }
    })();
  }, [selectNetwork]);

  return {
    state,
    actions: {
      goToStep,
      goBack,
      selectNetwork,
      selectNodeType,
      selectWalletChoice,
      createWallet,
      confirmBackup,
      importWallet,
      setImportPassword,
      skipImportPassword,
      completeSetup,
      setError,
      clearError,
    },
    computed: {
      getStepNumber,
      getTotalSteps,
      canGoBack,
    },
  };
}
