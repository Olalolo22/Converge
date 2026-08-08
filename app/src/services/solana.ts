// ─────────────────────────────────────────────────────────────────────
// Converge — Solana Service
// Manages dual-connection to Solana base layer + MagicBlock ER.
//
// ROUTING RULES:
//   create_session      → Solana RPC  (base layer PDA init)
//   delegate_session    → Solana RPC  (hands off to ER)
//   join_session        → ER RPC      (presence tracking)
//   heartbeat           → ER RPC      (keep alive)
//   sign_session        → ER RPC      (signing — no L1 write)
//   commit_session      → ER RPC      (flush + undelegate → L1 write)
//   expire_session      → Solana RPC  (post-expiry cleanup)
//   read session/record → Solana RPC  (query final state)
// ─────────────────────────────────────────────────────────────────────

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AnchorProvider, Program, BN, Idl } from '@coral-xyz/anchor';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import type {
  ConvergeSession,
  ConvergeCommitRecord,
  CreateRoomForm,
  CommitPayload,
  ErSessionState,
  ErParticipantState,
} from '../types/converge';

// ─────────────────────────────────────────────
// RPC Endpoints — follow MagicBlock SDK docs
// ─────────────────────────────────────────────
export const SOLANA_RPC = 'https://api.devnet.solana.com';
// Magic Router auto-routes delegated/non-delegated accounts
export const ER_RPC = 'https://devnet-router.magicblock.app';
export const ER_WS = 'wss://devnet-router.magicblock.app';

// ─────────────────────────────────────────────
// Program constants (matches lib.rs)
// ─────────────────────────────────────────────
export const PROGRAM_ID = new PublicKey(
  '9VnuYqz9fkambuAVxXWkHGtf1EpzLzchSFDRvpSwNLWU'
);
const SESSION_SEED = Buffer.from('converge_session');
const RECORD_SEED = Buffer.from('converge_record');

// ─────────────────────────────────────────────
// Connections
// ─────────────────────────────────────────────
export const solanaConnection = new Connection(SOLANA_RPC, 'confirmed');
export const erConnection = new Connection(ER_RPC, {
  commitment: 'confirmed',
  wsEndpoint: ER_WS,
});

// ─────────────────────────────────────────────
// PDA helpers
// ─────────────────────────────────────────────
export function getSessionPda(creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SESSION_SEED, creator.toBuffer()],
    PROGRAM_ID
  );
}

export function getRecordPda(session: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [RECORD_SEED, session.toBuffer()],
    PROGRAM_ID
  );
}

// ─────────────────────────────────────────────
// SHA-256 commitment hash (browser-native)
// ─────────────────────────────────────────────
export async function computeCommitmentHash(text: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

export function hashToHex(hash: Uint8Array): string {
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────
// Get Anchor provider (connection-aware)
// ─────────────────────────────────────────────
export function getBaseProvider(wallet: WalletContextState): AnchorProvider {
  return new AnchorProvider(
    solanaConnection,
    wallet as any,
    { commitment: 'confirmed' }
  );
}

export function getErProvider(wallet: WalletContextState): AnchorProvider {
  return new AnchorProvider(
    erConnection,
    wallet as any,
    { commitment: 'confirmed' }
  );
}

// ─────────────────────────────────────────────
// create_session + delegate_session
// Both sent to Solana base layer.
// Returns: session PDA pubkey
// ─────────────────────────────────────────────
export async function createAndDelegateSession(
  wallet: WalletContextState,
  program: Program,
  form: CreateRoomForm,
  commitmentHash: Uint8Array
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const creator = wallet.publicKey;
  const [sessionPda] = getSessionPda(creator);

  const participantPubkeys = form.participantAddresses.map(
    (addr) => new PublicKey(addr)
  );
  const expiryTs = Math.floor(Date.now() / 1000) + form.expiryMinutes * 60;

  // 1. create_session → base layer
  await (program.methods as any)
    .createSession(
      participantPubkeys,
      Array.from(commitmentHash),
      form.quorum,
      new BN(expiryTs),
      form.context,
      form.metadataUri
    )
    .accounts({
      creator,
      session: sessionPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  // 2. delegate_session → base layer (hands PDA to MagicBlock delegation program)
  await (program.methods as any)
    .delegateSession()
    .accounts({
      creator,
      session: sessionPda,
    })
    .rpc();

  return sessionPda.toBase58();
}

// ─────────────────────────────────────────────
// join_session → ER RPC
// Routes to MagicBlock validator via erProvider.
// ─────────────────────────────────────────────
export async function joinSession(
  wallet: WalletContextState,
  erProgram: Program,
  sessionPda: PublicKey
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const [pda] = getSessionPda(
    // Session PDA is derived from creator — we pass it directly
    new PublicKey(sessionPda)
  );

  const sig = await (erProgram.methods as any)
    .joinSession()
    .accounts({
      participant: wallet.publicKey,
      session: sessionPda,
    })
    .rpc();

  return sig;
}

// ─────────────────────────────────────────────
// heartbeat → ER RPC
// ─────────────────────────────────────────────
export async function sendHeartbeat(
  wallet: WalletContextState,
  erProgram: Program,
  sessionPda: PublicKey
): Promise<void> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  await (erProgram.methods as any)
    .heartbeat()
    .accounts({
      participant: wallet.publicKey,
      session: sessionPda,
    })
    .rpc();
}

// ─────────────────────────────────────────────
// sign_session → ER RPC
// High-speed — no Solana L1 write, pure ER state update.
// ─────────────────────────────────────────────
export async function signSession(
  wallet: WalletContextState,
  erProgram: Program,
  sessionPda: PublicKey
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const sig = await (erProgram.methods as any)
    .signSession()
    .accounts({
      participant: wallet.publicKey,
      session: sessionPda,
    })
    .rpc();

  return sig;
}

// ─────────────────────────────────────────────
// commit_session → ER RPC (flushes to Solana)
// Called by client when quorum is reached.
// Uses ER provider — MagicBlock validator commits state to L1.
// ─────────────────────────────────────────────
export async function commitSession(
  wallet: WalletContextState,
  erProgram: Program,
  sessionPda: PublicKey,
  payload: CommitPayload
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const [recordPda] = getRecordPda(sessionPda);

  const sig = await (erProgram.methods as any)
    .commitSession(
      payload.signedPubkeys.map((pk) => new PublicKey(pk)),
      Array.from(payload.erSessionHash)
    )
    .accounts({
      creator: wallet.publicKey,
      session: sessionPda,
      commitRecord: recordPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return sig;
}

// ─────────────────────────────────────────────
// expire_session → Solana base layer
// Called after expiry_ts has passed.
// ─────────────────────────────────────────────
export async function expireSession(
  wallet: WalletContextState,
  baseProgram: Program,
  sessionPda: PublicKey
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const sig = await (baseProgram.methods as any)
    .expireSession()
    .accounts({
      caller: wallet.publicKey,
      session: sessionPda,
    })
    .rpc();

  return sig;
}

// ─────────────────────────────────────────────
// Read ConvergeSession from Solana
// ─────────────────────────────────────────────
export async function fetchSession(
  program: Program,
  sessionPda: PublicKey
): Promise<ConvergeSession | null> {
  try {
    const raw = await (program.account as any).convergeSession.fetch(sessionPda);
    return {
      creator: raw.creator.toBase58(),
      participantPubkeys: raw.participantPubkeys.map((pk: PublicKey) => pk.toBase58()),
      commitmentHash: hashToHex(new Uint8Array(raw.commitmentHash)),
      quorum: raw.quorum,
      status: parseStatus(raw.status),
      expiryTs: raw.expiryTs.toNumber(),
      committedAt: raw.committedAt.toNumber(),
      context: raw.context,
      metadataUri: raw.metadataUri,
      sessionPubkey: sessionPda.toBase58(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Read ConvergeCommitRecord from Solana
// ─────────────────────────────────────────────
export async function fetchCommitRecord(
  program: Program,
  sessionPda: PublicKey
): Promise<ConvergeCommitRecord | null> {
  try {
    const [recordPda] = getRecordPda(sessionPda);
    const raw = await (program.account as any).convergeCommitRecord.fetch(recordPda);
    return {
      session: raw.session.toBase58(),
      commitmentHash: hashToHex(new Uint8Array(raw.commitmentHash)),
      signedPubkeys: raw.signedPubkeys.map((pk: PublicKey) => pk.toBase58()),
      quorum: raw.quorum,
      committedAt: raw.committedAt.toNumber(),
      erSessionHash: hashToHex(new Uint8Array(raw.erSessionHash)),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function parseStatus(raw: any): 'Pending' | 'Committed' | 'Expired' {
  if ('committed' in raw) return 'Committed';
  if ('expired' in raw) return 'Expired';
  return 'Pending';
}

export function shortenPubkey(pubkey: string, chars = 4): string {
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}

export function formatCountdown(expiryTs: number): string {
  const remaining = Math.max(0, expiryTs - Math.floor(Date.now() / 1000));
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
