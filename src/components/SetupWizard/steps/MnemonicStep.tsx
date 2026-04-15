import { RecoveryPhraseDisplay } from '../../common/RecoveryPhraseDisplay';

interface MnemonicStepProps {
  mnemonic: string[];
  publicKey: string;
  masterSeed?: string;
  onConfirm: () => void;
  isProcessing: boolean;
}

export function MnemonicStep({ mnemonic, publicKey, masterSeed, onConfirm, isProcessing }: MnemonicStepProps) {
  return (
    <RecoveryPhraseDisplay
      mnemonic={mnemonic}
      publicKey={publicKey}
      masterSeed={masterSeed}
      onConfirm={onConfirm}
      isProcessing={isProcessing}
      showConfirmCheckbox={true}
    />
  );
}
