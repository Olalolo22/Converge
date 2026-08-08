// ─────────────────────────────────────────────────────────────────
// Converge — Core TypeScript Types
// Mirrors the Anchor program data structures and ER session state
// ─────────────────────────────────────────────────────────────────

export type SessionStatus = 'Pending' | 'Committed' | 'Expired';
export type ErStatus = 'OPEN' | 'SIGNING' | 'COMMITTING' | 'COMMITTED' | 'EXPIRED';
export type AppMode = 'real' | 'simulator';
export type AppView = 'home' | 'create' | 'room' | 'proof';

// ─────────────────────────────────────────────
// Onchain — ConvergeSession PDA
// ─────────────────────────────────────────────
export interface ConvergeSession {
  creator: string;           // base58 pubkey
  participantPubkeys: string[];
  commitmentHash: string;    // hex string (32 bytes)
  quorum: number;
  status: SessionStatus;
  expiryTs: number;          // unix seconds
  committedAt: number;       // 0 if not committed
  context: string;
  metadataUri: string;
  sessionPubkey: string;     // the PDA address itself
}

// ─────────────────────────────────────────────
// Onchain — ConvergeCommitRecord PDA
// Written to Solana at successful commit
// ─────────────────────────────────────────────
export interface ConvergeCommitRecord {
  session: string;
  commitmentHash: string;
  signedPubkeys: string[];
  quorum: number;
  committedAt: number;
  erSessionHash: string;
  txSignature?: string;      // Solana tx sig for explorer link
}

// ─────────────────────────────────────────────
// ER-side — Per-participant state (live)
// Tracked inside MagicBlock ER, never written to Solana
// ─────────────────────────────────────────────
export interface ErParticipantState {
  pubkey: string;
  present: boolean;
  signed: boolean;
  lastHeartbeat: number;     // unix ms
  displayName?: string;      // optional short label for UI
}

// ─────────────────────────────────────────────
// ER-side — Full session state (live snapshot)
// ─────────────────────────────────────────────
export interface ErSessionState {
  sessionId: string;
  commitmentText: string;    // raw text — sha256'd to commitment_hash
  commitmentHash: string;    // hex
  participants: ErParticipantState[];
  quorum: number;
  expiryTs: number;
  status: ErStatus;
  signedCount: number;
  hasQuorum: boolean;
}

// ─────────────────────────────────────────────
// UI State — Room view combined data
// ─────────────────────────────────────────────
export interface RoomState {
  session: ConvergeSession;
  erState: ErSessionState;
  commitRecord?: ConvergeCommitRecord;
}

// ─────────────────────────────────────────────
// Create Room Form
// ─────────────────────────────────────────────
export interface CreateRoomForm {
  commitmentText: string;
  participantAddresses: string[];
  quorum: number;
  expiryMinutes: number;
  context: string;
  metadataUri: string;
}

// ─────────────────────────────────────────────
// Commit Payload passed to commit_session instruction
// ─────────────────────────────────────────────
export interface CommitPayload {
  signedPubkeys: string[];
  erSessionHash: Uint8Array;
}

// ─────────────────────────────────────────────
// Known demo wallets for simulator mode
// ─────────────────────────────────────────────
export interface SimParticipant {
  name: string;
  pubkey: string;
  color: string;
}

export const DEMO_PARTICIPANTS: SimParticipant[] = [
  {
    name: 'Alice',
    pubkey: 'ALiCE111111111111111111111111111111111111111',
    color: '#a78bfa',
  },
  {
    name: 'Bob',
    pubkey: 'bOb2222222222222222222222222222222222222222',
    color: '#34d399',
  },
  {
    name: 'Charlie',
    pubkey: 'ChARLie33333333333333333333333333333333333',
    color: '#60a5fa',
  },
  {
    name: 'Diana',
    pubkey: 'DiANA444444444444444444444444444444444444444',
    color: '#f472b6',
  },
  {
    name: 'Eve',
    pubkey: 'EveVE555555555555555555555555555555555555555',
    color: '#fbbf24',
  },
];
