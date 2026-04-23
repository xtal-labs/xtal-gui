import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Types
export type WizardStep =
  | 'welcome'
  | 'network'
  | 'node-type'
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
}

const CREATE_STEP_ORDER: WizardStep[] = [
  'welcome',
  'network',
  'node-type',
  'wallet-choice',
  'wallet-create',
  'mnemonic',
  'complete'
];

const IMPORT_STEP_ORDER: WizardStep[] = [
  'welcome',
  'network',
  'node-type',
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
        step: 'node-type',
        isProcessing: false,
      }));
    } catch (e) {
      setError(String(e));
    }
  }, [setError]);

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
        step: 'wallet-choice',
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
      return 5; // welcome, network, node-type, wallet-choice, complete
    }
    return 7;
  }, [state.walletChoice]);

  const canGoBack = useCallback(() => {
    return state.step !== 'welcome' && !state.isProcessing;
  }, [state.step, state.isProcessing]);

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
