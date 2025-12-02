import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "../idl/test_2.json";

export const PROGRAM_ID = new PublicKey(idl.address);
export const BOARD_SIZE = 100;

// Ephemeral Rollup endpoint (for delegated accounts)
export const ER_ENDPOINT = "https://devnet.magicblock.app";
export const ER_WS = "wss://devnet.magicblock.app";

// Magic Router endpoint for automatic routing between base layer and ER
export const MAGIC_ROUTER_ENDPOINT = "https://devnet-router.magicblock.app";
export const MAGIC_ROUTER_WS = "wss://devnet-router.magicblock.app";

// ER Validators (use when explicitly delegating)
export const ER_VALIDATORS = {
  asia: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
  eu: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  us: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  local: new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"),
};

// Magic Program constants (for commit/undelegate operations)
export const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
export const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");
export const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLw2UUtTpEcfpi5X");

// Get delegation record PDA
export function getDelegationPda(pda: PublicKey) {
  const [delegationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), pda.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  return delegationPda;
}

// Get commit state PDA  
export function getCommitStatePda(pda: PublicKey) {
  const [commitStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("commit"), pda.toBuffer()],
    MAGIC_PROGRAM_ID
  );
  return commitStatePda;
}

export function getProgram(provider: AnchorProvider) {
  return new Program(idl as any, provider);
}

export function getBoardPda() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("board")],
    PROGRAM_ID
  );
  return pda;
}

export function getPlayerPda(authority: PublicKey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), authority.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getConnection(useMagicRouter = false) {
  if (useMagicRouter) {
    // Use Magic Router for automatic routing between base layer and ER
    return new Connection(MAGIC_ROUTER_ENDPOINT, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000, // 60 seconds for devnet
      wsEndpoint: MAGIC_ROUTER_WS,
    });
  }
  // Use devnet directly
  return new Connection("https://api.devnet.solana.com", {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });
}

// Get connection based on whether account is delegated
export function getConnectionForAccount(isDelegated: boolean) {
  if (isDelegated) {
    // Use ER endpoint for delegated accounts
    return new Connection(ER_ENDPOINT, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
      wsEndpoint: ER_WS,
    });
  }
  // Use devnet for non-delegated accounts
  return getConnection(false);
}
