import { Keypair, PublicKey, Transaction, SystemProgram, Connection, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { sha256 } from "@noble/hashes/sha2.js";

// WARNING: Session key secrets are cached in localStorage (plaintext).
// This is a security risk. Consider encrypting with user-derived key or avoiding persistence.
const SESSION_KEY_MESSAGE = "Sign this message to generate your deterministic session key for the game. This key will be the same across all devices.";

// Extended wallet type that includes signMessage
type WalletWithSignMessage = AnchorWallet & {
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

/**
 * Derives a deterministic session keypair from wallet signature
 * Uses signMessage for true determinism (same wallet = same key across devices)
 * Falls back to signTransaction with a canonical message if signMessage not available
 * Binds to origin to prevent cross-app key reuse
 */
export async function deriveSessionKey(wallet: AnchorWallet, connection: Connection): Promise<Keypair> {
  const walletWithMsg = wallet as WalletWithSignMessage;

  // Create deterministic message bound to this origin
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const messageText = `${SESSION_KEY_MESSAGE}\n\nOrigin: ${origin}`;
  const messageBytes = new TextEncoder().encode(messageText);

  let signature: Uint8Array;

  // Try signMessage first (preferred method)
  if (walletWithMsg.signMessage) {
    signature = await walletWithMsg.signMessage(messageBytes);
  } else {
    // Fallback: Use signTransaction with a canonical message embedded in transaction memo
    // This is less ideal but works with wallets that don't support signMessage
    console.warn("Wallet doesn't support signMessage, using signTransaction fallback");

    // Create a memo instruction with our deterministic message
    const memoInstruction = {
      keys: [],
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      data: Buffer.from(messageText, 'utf-8'),
    };

    const transaction = new Transaction().add(memoInstruction);

    // Use a fixed blockhash for determinism (this won't be sent on-chain)
    // Create a deterministic 32-byte hash and encode it as a base58 PublicKey
    const canonicalHash = sha256(new Uint8Array([...wallet.publicKey.toBuffer(), ...messageBytes]));
    const canonicalKey = new PublicKey(canonicalHash);
    transaction.recentBlockhash = canonicalKey.toBase58();
    transaction.feePayer = wallet.publicKey;

    const signed = await wallet.signTransaction(transaction);

    if (!signed.signature) {
      throw new Error("Failed to get signature from wallet");
    }

    signature = signed.signature;
  }

  // Hash signature + message to create seed
  const combinedData = new Uint8Array([...signature, ...messageBytes]);
  const hash = sha256(combinedData);
  const seed = hash.slice(0, 32);

  // Generate deterministic keypair from seed
  const keypair = Keypair.fromSeed(seed);

  console.log("Derived session key:", keypair.publicKey.toString());
  return keypair;
}

/**
 * Get cached session key from localStorage or derive new one
 */
export async function getOrCreateSessionKey(
  wallet: AnchorWallet,
  walletPubkey: PublicKey,
  connection: Connection
): Promise<Keypair> {
  const cacheKey = `session_key_${walletPubkey.toString()}`;

  // Try to load from cache
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const secretKey = Uint8Array.from(JSON.parse(cached));
      const keypair = Keypair.fromSecretKey(secretKey);
      console.log("Loaded cached session key:", keypair.publicKey.toString());
      return keypair;
    } catch (e) {
      console.error("Failed to load cached session key:", e);
    }
  }

  // Derive new session key
  console.log("Deriving new session key...");
  const sessionKey = await deriveSessionKey(wallet, connection);

  // Cache it
  localStorage.setItem(cacheKey, JSON.stringify(Array.from(sessionKey.secretKey)));
  console.log("Cached session key:", sessionKey.publicKey.toString());

  return sessionKey;
}

/**
 * Clear cached session key
 */
export function clearSessionKey(walletPubkey: PublicKey) {
  const cacheKey = `session_key_${walletPubkey.toString()}`;
  localStorage.removeItem(cacheKey);
}

/**
 * Check if session key is valid (exists in cache)
 */
export function hasSessionKey(walletPubkey: PublicKey): boolean {
  const cacheKey = `session_key_${walletPubkey.toString()}`;
  return localStorage.getItem(cacheKey) !== null;
}

/**
 * Fund session key with lamports so it can pay transaction fees
 * @param wallet - Main wallet (will sign and pay for this transfer)
 * @param sessionKeyPubkey - Session key public key to fund
 * @param connection - Solana connection
 * @param lamports - Amount of lamports to transfer (default: 0.01 SOL = 10_000_000 lamports)
 */
export async function fundSessionKey(
  wallet: AnchorWallet,
  sessionKeyPubkey: PublicKey,
  connection: Connection,
  lamports: number = 10_000_000 // 0.01 SOL
): Promise<string> {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: sessionKeyPubkey,
      lamports,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  console.log(`Funded session key ${sessionKeyPubkey.toString()} with ${lamports} lamports`);
  return signature;
}

/**
 * Session wallet that can sign transactions with session key
 * NOTE: Session key must have lamports to pay transaction fees
 * Use fundSessionKey() to transfer lamports to the session key after registration
 */
export class SessionWallet implements AnchorWallet {
  constructor(
    public mainWallet: AnchorWallet,
    public sessionKey: Keypair
  ) { }

  get publicKey(): PublicKey {
    return this.sessionKey.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) {
      tx.sign([this.sessionKey]);
    } else {
      // Set fee payer to session key (must have lamports)
      tx.feePayer = this.sessionKey.publicKey;
      tx.partialSign(this.sessionKey);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return txs.map(tx => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([this.sessionKey]);
      } else {
        tx.feePayer = this.sessionKey.publicKey;
        tx.partialSign(this.sessionKey);
      }
      return tx;
    });
  }

  signMessage(message: Uint8Array): Promise<Uint8Array> {
    return Promise.resolve(nacl.sign.detached(message, this.sessionKey.secretKey));
  }
}
