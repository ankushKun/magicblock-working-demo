import { useEffect, useState, useRef, useCallback } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getProgram, getPlayerPda, getBoardPda, getConnection, ER_ENDPOINT, ER_WS, BOARD_SIZE, ER_VALIDATORS, getDelegationPda, getCommitStatePda, DELEGATION_PROGRAM_ID } from "@/lib/anchor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Key, ShieldOff, Zap, ZapOff } from "lucide-react";
import { useSessionKey } from "@/hooks/useSessionKey";
import { SessionKeySetupDialog } from "@/components/SessionKeySetupDialog";

interface PlayerData {
  x: number;
  y: number;
  authority: string;
  sessionKey: string | null;
  isDelegated?: boolean;
}

export function GameBoard() {
  const { connected, publicKey } = useWallet();
  const wallet = useAnchorWallet();

  // Dual state: base layer and ER
  const [basePlayer, setBasePlayer] = useState<PlayerData | null>(null);
  const [erPlayer, setErPlayer] = useState<PlayerData | null>(null);
  const [isDelegated, setIsDelegated] = useState(false);

  const [loading, setLoading] = useState(false);
  const [boardInitialized, setBoardInitialized] = useState(false);
  const [showSessionSetupDialog, setShowSessionSetupDialog] = useState(false);

  // Dual connections
  const baseConnection = useRef<Connection | null>(null);
  const erConnection = useRef<Connection | null>(null);

  // Subscription IDs
  const baseSubscriptionId = useRef<number | null>(null);
  const erSubscriptionId = useRef<number | null>(null);

  const {
    sessionKey,
    sessionWallet,
    isRegistered,
    loading: sessionLoading,
    createSessionKey,
    registerSessionKey,
    fundSessionKey,
    revokeSessionKey,
    clearSessionOnUndelegate,
  } = useSessionKey();

  // Computed player: use ER player if delegated, otherwise base player
  const player = isDelegated ? erPlayer : basePlayer;

  async function checkBoardInitialized() {
    if (!baseConnection.current) return;
    try {
      const boardPda = getBoardPda();
      const accountInfo = await baseConnection.current.getAccountInfo(boardPda);
      setBoardInitialized(accountInfo !== null);
    } catch (error) {
      console.error("Error checking board:", error);
    }
  }

  const fetchPlayerData = useCallback(async () => {
    if (!wallet || !publicKey || !baseConnection.current) return;

    try {
      const playerPda = getPlayerPda(publicKey);
      const baseProvider = new AnchorProvider(baseConnection.current, wallet, {});
      const baseProgram = getProgram(baseProvider);

      // Check base layer
      const accountInfo = await baseConnection.current.getAccountInfo(playerPda);
      if (!accountInfo) {
        console.log("Player not found");
        setBasePlayer(null);
        setErPlayer(null);
        setIsDelegated(false);
        return;
      }

      // Determine delegation status
      const delegated = accountInfo.owner.toString() !== baseProgram.programId.toString();
      setIsDelegated(delegated);

      // Fetch from base layer
      try {
        const playerAccount = await (baseProgram.account as any).player.fetch(playerPda);
        setBasePlayer({
          x: playerAccount.x,
          y: playerAccount.y,
          authority: playerAccount.authority.toString(),
          sessionKey: playerAccount.sessionKey?.toString() || null,
          isDelegated: false,
        });
      } catch (e) {
        console.log("Could not fetch from base layer", e);
      }

      // If delegated, fetch from ER
      if (delegated && erConnection.current) {
        try {
          // Trigger lazy load with airdrop
          try {
            await erConnection.current.requestAirdrop(playerPda, 1);
          } catch {
            console.log("Refreshed account in ER");
          }

          const erProvider = new AnchorProvider(erConnection.current, wallet, {});
          const erProgram = getProgram(erProvider);
          const erPlayerAccount = await (erProgram.account as any).player.fetch(playerPda);
          setErPlayer({
            x: erPlayerAccount.x,
            y: erPlayerAccount.y,
            authority: erPlayerAccount.authority.toString(),
            sessionKey: erPlayerAccount.sessionKey?.toString() || null,
            isDelegated: true,
          });
        } catch (e) {
          console.log("Could not fetch from ER", e);
        }
      } else {
        setErPlayer(null);
      }
    } catch (error) {
      console.log("Error fetching player data:", error);
      setBasePlayer(null);
      setErPlayer(null);
      setIsDelegated(false);
    }
  }, [wallet, publicKey]);

  const subscribeToPlayerUpdates = useCallback(async () => {
    if (!wallet || !publicKey || !baseConnection.current || !erConnection.current) return;

    try {
      const playerPda = getPlayerPda(publicKey);
      const baseProvider = new AnchorProvider(baseConnection.current, wallet, {});
      const baseProgram = getProgram(baseProvider);

      // Handler for base layer changes
      const handleBaseChange = (accountInfo: any) => {
        try {
          const decodedData = baseProgram.coder.accounts.decode('player', accountInfo.data);
          setBasePlayer({
            x: decodedData.x,
            y: decodedData.y,
            authority: decodedData.authority.toString(),
            sessionKey: decodedData.sessionKey?.toString() || null,
            isDelegated: false,
          });

          // Update delegation status
          const delegated = accountInfo.owner.toString() !== baseProgram.programId.toString();
          setIsDelegated(delegated);
        } catch (error) {
          console.error("Error decoding base player data:", error);
        }
      };

      // Handler for ER changes
      const handleErChange = (accountInfo: any) => {
        try {
          const erProvider = new AnchorProvider(erConnection.current!, wallet, {});
          const erProgram = getProgram(erProvider);
          const decodedData = erProgram.coder.accounts.decode('player', accountInfo.data);

          setErPlayer({
            x: decodedData.x,
            y: decodedData.y,
            authority: decodedData.authority.toString(),
            sessionKey: decodedData.sessionKey?.toString() || null,
            isDelegated: true,
          });
        } catch (error) {
          console.error("Error decoding ER player data:", error);
        }
      };

      // Subscribe to base layer
      if (baseSubscriptionId.current) {
        await baseConnection.current.removeAccountChangeListener(baseSubscriptionId.current);
      }
      baseSubscriptionId.current = baseConnection.current.onAccountChange(
        playerPda,
        handleBaseChange,
        'confirmed'
      );

      // Subscribe to ER
      if (erSubscriptionId.current) {
        await erConnection.current.removeAccountChangeListener(erSubscriptionId.current);
      }
      erSubscriptionId.current = erConnection.current.onAccountChange(
        playerPda,
        handleErChange,
        'confirmed'
      );

      console.log("Subscribed to player updates on both base layer and ER");
    } catch (error) {
      console.error("Error subscribing to player updates:", error);
    }
  }, [wallet, publicKey]);

  const unsubscribeFromUpdates = useCallback(async () => {
    try {
      if (baseSubscriptionId.current && baseConnection.current) {
        await baseConnection.current.removeAccountChangeListener(baseSubscriptionId.current);
        baseSubscriptionId.current = null;
      }

      if (erSubscriptionId.current && erConnection.current) {
        await erConnection.current.removeAccountChangeListener(erSubscriptionId.current);
        erSubscriptionId.current = null;
      }

      console.log("Unsubscribed from player updates");
    } catch (error) {
      console.error("Error unsubscribing:", error);
    }
  }, []);

  // Initialize connections on mount
  useEffect(() => {
    // Initialize base connection
    baseConnection.current = getConnection();
    // Initialize ER connection
    erConnection.current = new Connection(ER_ENDPOINT, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
      wsEndpoint: ER_WS,
    });

    checkBoardInitialized();
  }, []);

  // Handle player data fetching and subscriptions
  useEffect(() => {
    if (connected && publicKey) {
      fetchPlayerData();
      subscribeToPlayerUpdates();
    } else {
      setBasePlayer(null);
      setErPlayer(null);
      setIsDelegated(false);
      unsubscribeFromUpdates();
    }

    return () => {
      unsubscribeFromUpdates();
    };
  }, [connected, publicKey, fetchPlayerData, subscribeToPlayerUpdates, unsubscribeFromUpdates]);

  async function initializeBoard() {
    if (!wallet || !baseConnection.current) return;

    setLoading(true);
    try {
      const provider = new AnchorProvider(baseConnection.current, wallet, {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        skipPreflight: false,
      });
      const program = getProgram(provider);

      const tx = await program.methods.initialize().rpc({ skipPreflight: false });

      // Wait a bit for confirmation on devnet
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast.success("Board initialized!", { description: `Transaction: ${tx}` });
      setBoardInitialized(true);
    } catch (error: any) {
      console.error("Error initializing board:", error);

      // Check if it's a timeout error - board might still be initialized
      if (error.message?.includes("timeout") || error.message?.includes("expired")) {
        toast.warning("Transaction timed out", {
          description: "Checking if board was initialized...",
        });
        // Recheck board status
        await checkBoardInitialized();
        if (!boardInitialized) {
          toast.error("Board not initialized. Please try again.");
        }
      } else {
        toast.error("Failed to initialize board", {
          description: error.message || "Unknown error",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function joinGame() {
    if (!wallet || !baseConnection.current) return;

    setLoading(true);
    try {
      const provider = new AnchorProvider(baseConnection.current, wallet, {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });
      const program = getProgram(provider);

      const tx = await program.methods.joinGame().rpc({ skipPreflight: false });

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast.success("Joined game at (10, 10)!", { description: `Transaction: ${tx}` });
      await fetchPlayerData();
    } catch (error: any) {
      console.error("Error joining game:", error);
      const errorMsg = error.message || error.toString() || "Unknown error";

      // Check for timeout - player might be joined
      if (errorMsg.includes("timeout") || errorMsg.includes("expired")) {
        toast.warning("Transaction timed out", {
          description: "Checking player status...",
        });
        await fetchPlayerData();
        return;
      }

      // Check for account already exists error
      if (errorMsg.includes("already in use") || errorMsg.includes("custom program error: 0x0")) {
        toast.error("Account already exists", {
          description: "Your player account exists but may be from an old version. Please contact support or use a different wallet.",
        });
      } else {
        toast.error("Failed to join game", {
          description: errorMsg,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function movePlayer(xDir: number, yDir: number) {
    // Use session wallet if available, otherwise use main wallet
    const activeWallet = (isRegistered && sessionWallet) ? sessionWallet : wallet;
    if (!activeWallet || !publicKey) return;

    setLoading(true);
    try {
      // Use ER connection if delegated, base connection otherwise
      const connection = isDelegated ? erConnection.current : baseConnection.current;
      if (!connection) return;

      const provider = new AnchorProvider(connection, activeWallet, {
        commitment: "confirmed",
      });
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      const tx = await program.methods
        .movePlayer(xDir, yDir)
        .accounts({
          player: playerPda,
          signer: activeWallet.publicKey,
        })
        .rpc();

      const direction = `${xDir > 0 ? "right" : xDir < 0 ? "left" : ""} ${yDir > 0 ? "down" : yDir < 0 ? "up" : ""}`.trim();
      const speedText = isDelegated ? " ⚡ (Ephemeral Rollup)" : "";
      toast.success(`Moved ${direction}${speedText}`, {
        description: isRegistered ? "Using session key (no approval needed!)" : `Transaction: ${tx}`,
      });
      await fetchPlayerData();
    } catch (error: any) {
      console.error("Error moving player:", error);
      toast.error("Failed to move", {
        description: error.message || "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function delegatePlayer() {
    if (!wallet || !publicKey) return;

    setLoading(true);
    try {
      // Delegate MUST be sent on base layer
      if (!baseConnection.current) return;
      const provider = new AnchorProvider(baseConnection.current, wallet, {});
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      const tx = await program.methods
        .delegatePlayer()
        .accounts({
          payer: wallet.publicKey,
          authority: wallet.publicKey,
          pda: playerPda,
        })
        .remainingAccounts([
          { pubkey: ER_VALIDATORS.asia, isSigner: false, isWritable: false }
        ])
        .rpc();

      toast.success("Player delegated to Ephemeral Rollup!", {
        description: "Enjoy instant, gas-free movements! 🚀",
      });
      await fetchPlayerData();
    } catch (error: any) {
      console.error("Error delegating player:", error);
      toast.error("Failed to delegate", {
        description: error.message || "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function undelegatePlayer() {
    if (!wallet || !publicKey || !erConnection.current) return;

    setLoading(true);
    try {
      // Undelegate MUST be sent on ER with the main wallet (not session key)
      // Session keys cannot undelegate themselves
      const provider = new AnchorProvider(erConnection.current, wallet, {
        commitment: "confirmed",
      });
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      toast.info("Committing state and undelegating...", {
        description: "This will sync your ER state to base layer",
      });

      const tx = await program.methods
        .undelegatePlayer()
        .accounts({
          payer: wallet.publicKey,
          player: playerPda,
          magicProgram: new PublicKey("Magic11111111111111111111111111111111111111"),
          magicContext: new PublicKey("MagicContext1111111111111111111111111111111"),
        })
        .rpc();

      toast.success("Player undelegated and state committed!", {
        description: "Your progress has been saved to base layer",
      });

      // Clear session key from local state since it's been cleared on-chain
      clearSessionOnUndelegate();

      // Wait a moment for state to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));
      await fetchPlayerData();
    } catch (error: any) {
      console.error("Error undelegating player:", error);
      toast.error("Failed to undelegate", {
        description: error.message || "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function commitPlayer() {
    if (!wallet || !publicKey || !erConnection.current) return;

    setLoading(true);
    try {
      // Commit MUST be sent on ER
      const provider = new AnchorProvider(erConnection.current, wallet, {
        commitment: "confirmed",
      });
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      toast.info("Committing state to base layer...");

      const tx = await program.methods
        .commitPlayer()
        .accounts({
          payer: wallet.publicKey,
          player: playerPda,
          magicProgram: new PublicKey("Magic11111111111111111111111111111111111111"),
          magicContext: new PublicKey("MagicContext1111111111111111111111111111111"),
        })
        .rpc();

      toast.success("State committed to base layer!", {
        description: `Transaction: ${tx}`,
      });
    } catch (error: any) {
      console.error("Error committing player:", error);
      toast.error("Failed to commit", {
        description: error.message || "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card>
          <CardHeader>
            <CardTitle>Welcome to Grid Game</CardTitle>
            <CardDescription>Connect your wallet to start playing</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!boardInitialized) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card>
          <CardHeader>
            <CardTitle>Initialize Game Board</CardTitle>
            <CardDescription>The game board needs to be initialized first</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={initializeBoard} disabled={loading}>
              {loading ? "Initializing..." : "Initialize Board"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card>
          <CardHeader>
            <CardTitle>Join the Game</CardTitle>
            <CardDescription>Click below to join and start at position (10, 10)</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={joinGame} disabled={loading}>
              {loading ? "Joining..." : "Join Game"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Grid Game - 100x100 Board</CardTitle>
          <CardDescription>Use the controls to move around the board</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Ephemeral Rollup Status */}
          {!player.isDelegated && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Enable Ephemeral Rollup</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Delegate your player to Ephemeral Rollup for instant, gas-free movements! ⚡
                  </p>
                  <Button
                    onClick={delegatePlayer}
                    disabled={loading}
                    size="sm"
                    className="mt-3"
                    variant="outline"
                  >
                    {loading ? "Delegating..." : "Enable ER Speed Mode"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {player.isDelegated && (
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-purple-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-500">⚡ Ephemeral Rollup Active</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enjoy instant, zero-fee movements! Transactions are batched and committed to Solana.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={commitPlayer}
                      disabled={loading}
                      size="sm"
                      variant="outline"
                    >
                      {loading ? "Committing..." : "Commit State"}
                    </Button>
                    <Button
                      onClick={undelegatePlayer}
                      disabled={loading}
                      size="sm"
                      variant="outline"
                    >
                      <ZapOff className="h-3 w-3 mr-2" />
                      {loading ? "Undelegating..." : "Disable ER Mode"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Session Key Status - Only available on ER */}
          {player.isDelegated && !isRegistered && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Enable Session Keys (ER Only)</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Register a session key to move without wallet approvals. Session keys only work on Ephemeral Rollups.
                  </p>
                  <Button
                    onClick={() => setShowSessionSetupDialog(true)}
                    disabled={sessionLoading}
                    size="sm"
                    className="mt-3"
                    variant="outline"
                  >
                    {sessionLoading ? "Setting up..." : "Enable Session Keys"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {player.isDelegated && isRegistered && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-green-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-500">Session Key Active</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Transactions will be auto-approved without wallet prompts. Session key will be cleared when you undelegate.
                  </p>
                  <Button
                    onClick={revokeSessionKey}
                    disabled={sessionLoading}
                    size="sm"
                    className="mt-3"
                    variant="outline"
                  >
                    <ShieldOff className="h-3 w-3 mr-2" />
                    {sessionLoading ? "Revoking..." : "Revoke Session Key"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Player Position Display */}
          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Current Position</p>
              <p className="text-2xl font-bold">
                ({player.x}, {player.y})
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Board Size</p>
              <p className="text-2xl font-bold">{BOARD_SIZE}x{BOARD_SIZE}</p>
            </div>
          </div>

          {/* Visual Grid Representation */}
          <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden">
            {/* Base layer player (50% opacity if different from ER) */}
            {basePlayer && isDelegated && (basePlayer.x !== erPlayer?.x || basePlayer.y !== erPlayer?.y) && (
              <div
                className="absolute w-4 h-4 bg-primary rounded-full transition-all duration-300 opacity-50"
                style={{
                  left: `${(basePlayer.x / (BOARD_SIZE - 1)) * 100}%`,
                  top: `${(basePlayer.y / (BOARD_SIZE - 1)) * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            )}
            {/* Current player position (ER if delegated, base otherwise) */}
            <div
              className="absolute w-4 h-4 bg-primary rounded-full transition-all duration-300"
              style={{
                left: `${(player.x / (BOARD_SIZE - 1)) * 100}%`,
                top: `${(player.y / (BOARD_SIZE - 1)) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
            {/* Grid lines */}
            <div className="absolute inset-0 grid grid-cols-10 grid-rows-10 opacity-20">
              {Array.from({ length: 100 }).map((_, i) => (
                <div key={i} className="border border-muted-foreground/20" />
              ))}
            </div>
          </div>

          {/* Movement Controls */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-center">Movement Controls</p>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={() => movePlayer(0, -1)}
                disabled={loading || player.y === 0}
                size="icon"
                variant="outline"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => movePlayer(-1, 0)}
                  disabled={loading || player.x === 0}
                  size="icon"
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => movePlayer(1, 0)}
                  disabled={loading || player.x === BOARD_SIZE - 1}
                  size="icon"
                  variant="outline"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <Button
                onClick={() => movePlayer(0, 1)}
                disabled={loading || player.y === BOARD_SIZE - 1}
                size="icon"
                variant="outline"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Large Movement Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-4">
              <Button
                onClick={() => movePlayer(-10, 0)}
                disabled={loading}
                variant="secondary"
              >
                Move Left 10
              </Button>
              <Button
                onClick={() => movePlayer(10, 0)}
                disabled={loading}
                variant="secondary"
              >
                Move Right 10
              </Button>
              <Button
                onClick={() => movePlayer(0, -10)}
                disabled={loading}
                variant="secondary"
              >
                Move Up 10
              </Button>
              <Button
                onClick={() => movePlayer(0, 10)}
                disabled={loading}
                variant="secondary"
              >
                Move Down 10
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session Key Setup Dialog */}
      <SessionKeySetupDialog
        open={showSessionSetupDialog}
        onOpenChange={setShowSessionSetupDialog}
        onComplete={() => {
          toast.success("Session keys enabled!", {
            description: "You can now move without wallet approvals!",
          });
        }}
        createSessionKey={createSessionKey}
        registerSessionKey={registerSessionKey}
        fundSessionKey={fundSessionKey}
        connection={baseConnection.current!}
      />
    </div>
  );
}
