import { useEffect, useState } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getProgram, getPlayerPda, getConnection, getConnectionForAccount } from "@/lib/anchor";
import { getOrCreateSessionKey, clearSessionKey, SessionWallet, fundSessionKey, hasSessionKey } from "@/lib/sessionKey";
import { toast } from "sonner";

export function useSessionKey() {
  const { connected, publicKey } = useWallet();
  const wallet = useAnchorWallet();
  const [sessionKey, setSessionKey] = useState<Keypair | null>(null);
  const [sessionWallet, setSessionWallet] = useState<SessionWallet | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDelegated, setIsDelegated] = useState(false);

  // Restore session key from cache on mount
  useEffect(() => {
    restoreSessionKey();
  }, [connected, publicKey, wallet]);

  // Check if session key is registered on-chain and delegation status
  useEffect(() => {
    checkRegistration();
  }, [connected, publicKey]);

  async function restoreSessionKey() {
    if (!wallet || !publicKey) {
      setSessionKey(null);
      setSessionWallet(null);
      return;
    }

    try {
      // Check if we have a cached session key
      if (hasSessionKey(publicKey)) {
        const connection = getConnection();
        const key = await getOrCreateSessionKey(wallet, publicKey, connection);
        setSessionKey(key);

        const sessWallet = new SessionWallet(wallet, key);
        setSessionWallet(sessWallet);

        console.log("Session key restored from cache:", key.publicKey.toString());
      }
    } catch (error) {
      console.error("Error restoring session key:", error);
    }
  }

  async function getCurrentDelegationStatus(): Promise<boolean> {
    if (!wallet || !publicKey) return false;

    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      const accountInfo = await connection.getAccountInfo(playerPda);
      if (!accountInfo) return false;

      return accountInfo.owner.toString() !== program.programId.toString();
    } catch (error) {
      return false;
    }
  }

  async function checkRegistration() {
    if (!wallet || !publicKey) {
      setIsRegistered(false);
      setIsDelegated(false);
      return;
    }

    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      // Check delegation status first
      const accountInfo = await connection.getAccountInfo(playerPda);
      const delegated = accountInfo?.owner.toString() !== program.programId.toString();
      setIsDelegated(delegated);

      // Fetch from correct connection based on delegation
      const correctConnection = getConnectionForAccount(delegated);
      const correctProvider = new AnchorProvider(correctConnection, wallet, {});
      const correctProgram = getProgram(correctProvider);

      const player = await (correctProgram.account as any).player.fetch(playerPda);
      const hasRegisteredKey = player.sessionKey !== null;
      setIsRegistered(hasRegisteredKey);

      // Note: We don't automatically derive the session key here anymore
      // User must click the "Activate Session Key" button to trigger derivation
      // This prevents unwanted wallet popups
    } catch (error) {
      setIsRegistered(false);
      setIsDelegated(false);
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

      // Get live delegation status
      const currentlyDelegated = await getCurrentDelegationStatus();

      // Use appropriate connection based on LIVE delegation status
      const connection = getConnectionForAccount(currentlyDelegated);
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);

      // Register session key on-chain
      const tx = await program.methods
        .registerSessionKey(key.publicKey)
        .rpc();

      const location = currentlyDelegated ? " on ER" : " on base layer";
      toast.success("Session key registered" + location + "!", {
        description: `Transaction: ${tx}`,
      });

      setIsRegistered(true);
      setIsDelegated(currentlyDelegated);
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

  async function fundSessionKeyWallet() {
    if (!wallet || !publicKey) {
      toast.error("Wallet not connected");
      return false;
    }

    setLoading(true);
    try {
      let key = sessionKey;
      if (!key) {
        toast.error("No session key found");
        return false;
      }

      // Always use base layer connection for funding since that's where wallet SOL is
      const baseConnection = getConnection();
      const fundTx = await fundSessionKey(wallet, key.publicKey, baseConnection);
      toast.success("Session key funded!", {
        description: `Transferred 0.01 SOL for transaction fees`,
      });

      return true;
    } catch (error: any) {
      console.error("Error funding session key:", error);
      toast.error("Failed to fund session key", {
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
      // Get live delegation status
      const currentlyDelegated = await getCurrentDelegationStatus();

      // Use appropriate connection based on LIVE delegation status
      const connection = getConnectionForAccount(currentlyDelegated);
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);

      const tx = await program.methods.revokeSessionKey().rpc();

      const location = currentlyDelegated ? " on ER" : " on base layer";
      toast.success("Session key revoked" + location, {
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

  // Function to clear session when undelegating (called from GameBoard)
  function clearSessionOnUndelegate() {
    if (publicKey) {
      clearSessionKey(publicKey);
      setSessionKey(null);
      setSessionWallet(null);
      setIsRegistered(false);
      console.log("Session key cleared due to undelegation");
    }
  }

  return {
    sessionKey,
    sessionWallet,
    isRegistered,
    loading,
    createSessionKey,
    registerSessionKey,
    fundSessionKey: fundSessionKeyWallet,
    revokeSessionKey,
    initializeSession,
    clearSessionOnUndelegate,
  };
}
