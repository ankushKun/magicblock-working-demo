import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "../idl/test_2.json";

export const PROGRAM_ID = new PublicKey(idl.address);
export const BOARD_SIZE = 100;

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

export function getConnection() {
  return new Connection("http://localhost:8899", "confirmed");
}
