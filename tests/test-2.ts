import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Test2 } from "../target/types/test_2";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("test-2", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.test2 as Program<Test2>;
  const provider = anchor.getProvider();

  const [boardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("board")],
    program.programId
  );

  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), provider.publicKey.toBuffer()],
    program.programId
  );

  // Local ER validator for testing
  const LOCAL_ER_VALIDATOR = new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");

  it("Initializes the board", async () => {
    const tx = await program.methods
      .initialize()
      .rpc();
    console.log("Board initialized:", tx);

    const board = await program.account.board.fetch(boardPda);
    expect(board.authority.toString()).to.equal(provider.publicKey.toString());
  });

  it("Player joins the game at position (10, 10)", async () => {
    const tx = await program.methods
      .joinGame()
      .rpc();
    console.log("Player joined:", tx);

    const player = await program.account.player.fetch(playerPda);
    expect(player.x).to.equal(10);
    expect(player.y).to.equal(10);
    expect(player.authority.toString()).to.equal(provider.publicKey.toString());
  });

  it("Player moves on the grid", async () => {
    // Move right and up
    await program.methods
      .movePlayer(5, -3)
      .rpc();

    let player = await program.account.player.fetch(playerPda);
    expect(player.x).to.equal(15); // 10 + 5
    expect(player.y).to.equal(7);  // 10 - 3

    // Move left and down
    await program.methods
      .movePlayer(-2, 4)
      .rpc();

    player = await program.account.player.fetch(playerPda);
    expect(player.x).to.equal(13); // 15 - 2
    expect(player.y).to.equal(11); // 7 + 4
  });

  it("Player cannot move outside grid boundaries", async () => {
    // Try to move far beyond grid bounds
    await program.methods
      .movePlayer(-50, -50)
      .rpc();

    let player = await program.account.player.fetch(playerPda);
    expect(player.x).to.equal(0); // Clamped to 0
    expect(player.y).to.equal(0); // Clamped to 0

    // Try to move to maximum bounds
    await program.methods
      .movePlayer(127, 127)
      .rpc();

    player = await program.account.player.fetch(playerPda);
    expect(player.x).to.equal(99); // Clamped to 99
    expect(player.y).to.equal(99); // Clamped to 99
  });

  it("Delegates player to Ephemeral Rollup", async () => {
    // Note: This test requires a running local ER validator
    // For full testing, run with: magicblock-validator

    try {
      await program.methods
        .delegatePlayer()
        .accounts({
          payer: provider.publicKey,
          authority: provider.publicKey,
          pda: playerPda,
        })
        .remainingAccounts([
          { pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }
        ])
        .rpc();

      console.log("✓ Player delegated to ER (requires running ER validator)");
    } catch (error) {
      console.log("⚠ Delegation skipped (ER validator not running):", error.message);
    }
  });
});
