import { useEffect, useState } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getProgram, getPlayerPda, getConnection } from "@/lib/anchor";
import { getOrCreateSessionKey, clearSessionKey, SessionWallet, fundSessionKey } from "@/lib/sessionKey";
import { toast } from "sonner";

export function useSessionKey() {
  const { connected, publicKey } = useWallet();
  const wallet = useAnchorWallet();
  const [sessionKey, setSessionKey] = useState<Keypair | null>(null);
  const [sessionWallet, setSessionWallet] = useState<SessionWallet | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if session key is registered on-chain
  useEffect(() => {
    checkRegistration();
  }, [connected, publicKey]);

  async function checkRegistration() {
    if (!wallet || !publicKey) {
      setIsRegistered(false);
      return;
    }

    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      const player = await (program.account as any).player.fetch(playerPda);
      setIsRegistered(player.sessionKey !== null);
    } catch (error) {
      setIsRegistered(false);
    }
  }

  async function createSessionKey() {
    if (!wallet || !publicKey) {
      toast.error("Wallet not connected");
      return null;
    }

    setLoading(true);
    try {
      const connection = getConnection();

      // Derive or load session key
      const key = await getOrCreateSessionKey(wallet, publicKey, connection);
      setSessionKey(key);

      // Create session wallet
      const sessWallet = new SessionWallet(wallet, key);
      setSessionWallet(sessWallet);

      toast.success("Session key created", {
        description: `Public key: ${key.publicKey.toString().slice(0, 8)}...`,
      });

      return key;
    } catch (error: any) {
      console.error("Error creating session key:", error);
      toast.error("Failed to create session key", {
        description: error.message || "Unknown error",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function registerSessionKey() {
    if (!wallet || !publicKey) {
      toast.error("Wallet not connected");
      return false;
    }

    setLoading(true);
    try {
      let key = sessionKey;
      if (!key) {
        key = await createSessionKey();
        if (!key) return false;
      }

      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);

      // Step 1: Register session key on-chain
      const tx = await program.methods
        .registerSessionKey(key.publicKey)
        .rpc();

      toast.success("Session key registered!", {
        description: `Transaction: ${tx}`,
      });

      // Step 2: Fund session key with lamports so it can pay fees
      try {
        const fundTx = await fundSessionKey(wallet, key.publicKey, connection);
        toast.success("Session key funded!", {
          description: `Transferred 0.01 SOL for transaction fees`,
        });
      } catch (fundError: any) {
        console.error("Error funding session key:", fundError);
        toast.warning("Session key registered but not funded", {
          description: "You may need to fund it manually to use it",
        });
      }

      setIsRegistered(true);
      return true;
    } catch (error: any) {
      console.error("Error registering session key:", error);
      toast.error("Failed to register session key", {
        description: error.message || "Unknown error",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function revokeSessionKey() {
    if (!wallet || !publicKey) {
      toast.error("Wallet not connected");
      return false;
    }

    setLoading(true);
    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);

      const tx = await program.methods.revokeSessionKey().rpc();

      toast.success("Session key revoked", {
        description: `Transaction: ${tx}`,
      });

      // Clear local cache
      clearSessionKey(publicKey);
      setSessionKey(null);
      setSessionWallet(null);
      setIsRegistered(false);

      return true;
    } catch (error: any) {
      console.error("Error revoking session key:", error);
      toast.error("Failed to revoke session key", {
        description: error.message || "Unknown error",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function initializeSession() {
    const key = await createSessionKey();
    if (key) {
      await registerSessionKey();
    }
  }

  return {
    sessionKey,
    sessionWallet,
    isRegistered,
    loading,
    createSessionKey,
    registerSessionKey,
    revokeSessionKey,
    initializeSession,
  };
}
