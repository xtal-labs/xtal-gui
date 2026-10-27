/**
 * Global `Window` augmentation for the native-menu → frontend bridge.
 *
 * The Rust menu handlers invoke these callbacks (installed by App.tsx) to open
 * wallet modals, unload the wallet and start the walkthrough. Declaring them
 * here replaces the `(window as any)` casts at the call sites with a single
 * typed surface.
 */

export {};

declare global {
  interface Window {
    openWalletCreate?: () => void;
    openWalletLoad?: (walletName: string) => void;
    openWalletChangePassword?: () => void;
    openWalletMultisig?: () => void;
    openWalletImportMnemonic?: () => void;
    openWalletImportKey?: () => void;
    openWalletImportFile?: () => void;
    openWalletRecovery?: () => void;
    unloadWallet?: () => Promise<void>;
    startWalkthrough?: () => void;
  }
}
