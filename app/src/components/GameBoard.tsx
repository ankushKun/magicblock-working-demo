import { useEffect, useState } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getProgram, getPlayerPda, getBoardPda, getConnection, BOARD_SIZE } from "@/lib/anchor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Key, ShieldOff } from "lucide-react";
import { useSessionKey } from "@/hooks/useSessionKey";

interface PlayerData {
  x: number;
  y: number;
  authority: string;
  sessionKey: string | null;
}

export function GameBoard() {
  const { connected, publicKey } = useWallet();
  const wallet = useAnchorWallet();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [boardInitialized, setBoardInitialized] = useState(false);

  const {
    sessionKey,
    sessionWallet,
    isRegistered,
    loading: sessionLoading,
    initializeSession,
    revokeSessionKey,
  } = useSessionKey();

  useEffect(() => {
    checkBoardInitialized();
  }, []);

  useEffect(() => {
    if (connected && publicKey) {
      fetchPlayerData();
    } else {
      setPlayer(null);
    }
  }, [connected, publicKey]);

  async function checkBoardInitialized() {
    try {
      const connection = getConnection();
      const boardPda = getBoardPda();
      const accountInfo = await connection.getAccountInfo(boardPda);
      setBoardInitialized(accountInfo !== null);
    } catch (error) {
      console.error("Error checking board:", error);
    }
  }

  async function fetchPlayerData() {
    if (!wallet || !publicKey) return;

    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);
      const playerPda = getPlayerPda(publicKey);

      const playerAccount = await (program.account as any).player.fetch(playerPda);
      setPlayer({
        x: playerAccount.x,
        y: playerAccount.y,
        authority: playerAccount.authority.toString(),
        sessionKey: playerAccount.sessionKey?.toString() || null,
      });
    } catch (error) {
      console.log("Player not found");
      setPlayer(null);
    }
  }

  async function initializeBoard() {
    if (!wallet) return;

    setLoading(true);
    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);

      const tx = await program.methods.initialize().rpc();
      toast.success("Board initialized!", { description: `Transaction: ${tx}` });
      setBoardInitialized(true);
    } catch (error: any) {
      console.error("Error initializing board:", error);
      toast.error("Failed to initialize board", {
        description: error.message || "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function joinGame() {
    if (!wallet) return;

    setLoading(true);
    try {
      const connection = getConnection();
      const provider = new AnchorProvider(connection, wallet, {});
      const program = getProgram(provider);

      const tx = await program.methods.joinGame().rpc();
      toast.success("Joined game at (10, 10)!", { description: `Transaction: ${tx}` });
      await fetchPlayerData();
    } catch (error: any) {
      console.error("Error joining game:", error);
      const errorMsg = error.message || error.toString() || "Unknown error";

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
      const connection = getConnection();
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
      toast.success(`Moved ${direction}`, {
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
          {/* Session Key Status */}
          {!isRegistered && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Enable Session Keys</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Register a session key to move without wallet approvals. The same key will be used across all devices.
                  </p>
                  <Button
                    onClick={initializeSession}
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

          {isRegistered && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-green-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-500">Session Key Active</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Transactions will be auto-approved without wallet prompts
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
    </div>
  );
}
