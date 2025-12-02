import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  return (
    <div className="fixed top-4 right-4 z-50">
      <WalletMultiButton />
    </div>
  );
}
