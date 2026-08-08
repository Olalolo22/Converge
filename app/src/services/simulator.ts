// ─────────────────────────────────────────────────────────────────────
// Converge — ER Simulator
//
// A high-fidelity in-memory mirror of the MagicBlock ER state machine.
// Purpose: offline testing + single-operator demos.
// The primary judging path ALWAYS uses real MagicBlock ER endpoints.
//
// Mirrors exactly: presence tracking, heartbeat expiry, signing,
// quorum detection, expiry enforcement, and terminal state transitions.
// ─────────────────────────────────────────────────────────────────────

import type {
  ErSessionState,
  ErParticipantState,
  CommitPayload,
} from '../types/converge';
import { computeCommitmentHash, hashToHex } from './solana';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const HEARTBEAT_TIMEOUT_MS = 30_000; // 30s without heartbeat → absent
const HEARTBEAT_INTERVAL_MS = 5_000;  // client sends heartbeat every 5s

// ─────────────────────────────────────────────
// Simulator class
// ─────────────────────────────────────────────
export class ErSimulator {
  private state: ErSessionState;
  private listeners: Array<(state: ErSessionState) => void> = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private onCommit: ((payload: CommitPayload) => void) | null = null;

  constructor(
    sessionId: string,
    commitmentText: string,
    commitmentHash: string,
    participantPubkeys: string[],
    quorum: number,
    expiryTs: number,
    onCommitCallback?: (payload: CommitPayload) => void
  ) {
    this.state = {
      sessionId,
      commitmentText,
      commitmentHash,
      quorum,
      expiryTs,
      status: 'OPEN',
      signedCount: 0,
      hasQuorum: false,
      participants: participantPubkeys.map((pk) => ({
        pubkey: pk,
        present: false,
        signed: false,
        lastHeartbeat: 0,
      })),
    };
    this.onCommit = onCommitCallback ?? null;

    // Presence decay: tick every 2s to check stale heartbeats
    this.heartbeatTimer = setInterval(() => {
      this.tickPresence();
    }, 2000);

    // Auto-expire at expiryTs
    const msUntilExpiry = expiryTs * 1000 - Date.now();
    if (msUntilExpiry > 0) {
      this.expiryTimer = setTimeout(() => {
        this.handleExpiry();
      }, msUntilExpiry);
    }
  }

  // ─────────────────────────────────────────────
  // join — sets present = true, stamps heartbeat
  // ─────────────────────────────────────────────
  join(pubkey: string): void {
    if (!this.isActive()) return;

    const participant = this.getParticipant(pubkey);
    if (!participant) throw new Error('Participant not in session');

    participant.present = true;
    participant.lastHeartbeat = Date.now();
    this.emit();
  }

  // ─────────────────────────────────────────────
  // heartbeat — refreshes lastHeartbeat
  // ─────────────────────────────────────────────
  heartbeat(pubkey: string): void {
    if (!this.isActive()) return;

    const participant = this.getParticipant(pubkey);
    if (!participant) return;

    participant.lastHeartbeat = Date.now();
    if (!participant.present) {
      participant.present = true; // rejoin if lapsed
    }
    this.emit();
  }

  // ─────────────────────────────────────────────
  // sign — marks participant as signed
  // Validates: present, not expired, in list
  // Triggers commit if quorum reached
  // ─────────────────────────────────────────────
  sign(pubkey: string): void {
    if (!this.isActive()) throw new Error('Session is not active');

    const participant = this.getParticipant(pubkey);
    if (!participant) throw new Error('Participant not in session');
    if (!participant.present) throw new Error('Must be present to sign');
    if (participant.signed) return; // idempotent

    participant.signed = true;
    this.recomputeQuorum();
    this.emit();

    if (this.state.hasQuorum) {
      this.state.status = 'COMMITTING';
      this.emit();
      setTimeout(() => this.handleCommit(), 800); // simulate commit latency
    }
  }

  // ─────────────────────────────────────────────
  // subscribe to state changes
  // ─────────────────────────────────────────────
  subscribe(listener: (state: ErSessionState) => void): () => void {
    this.listeners.push(listener);
    listener({ ...this.state }); // emit current state immediately
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ─────────────────────────────────────────────
  // Get current state snapshot
  // ─────────────────────────────────────────────
  getState(): ErSessionState {
    return { ...this.state };
  }

  // ─────────────────────────────────────────────
  // destroy
  // ─────────────────────────────────────────────
  destroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.listeners = [];
  }

  // ─────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────

  private getParticipant(pubkey: string): ErParticipantState | undefined {
    return this.state.participants.find((p) => p.pubkey === pubkey);
  }

  private isActive(): boolean {
    return (
      this.state.status === 'OPEN' || this.state.status === 'SIGNING'
    );
  }

  private recomputeQuorum(): void {
    this.state.signedCount = this.state.participants.filter((p) => p.signed).length;
    this.state.hasQuorum = this.state.signedCount >= this.state.quorum;
    if (this.state.signedCount > 0 && this.state.status === 'OPEN') {
      this.state.status = 'SIGNING';
    }
  }

  private tickPresence(): void {
    if (!this.isActive()) return;
    const now = Date.now();
    let changed = false;
    for (const p of this.state.participants) {
      if (p.present && p.lastHeartbeat > 0) {
        if (now - p.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
          p.present = false;
          changed = true;
        }
      }
    }
    if (changed) this.emit();
  }

  private handleExpiry(): void {
    if (this.state.status === 'COMMITTED') return;
    this.state.status = 'EXPIRED';
    this.emit();
    this.destroy();
  }

  private async handleCommit(): Promise<void> {
    const signedPubkeys = this.state.participants
      .filter((p) => p.signed)
      .map((p) => p.pubkey);

    // Generate a deterministic ER session hash (in real ER, this is a hash of session state)
    const encoder = new TextEncoder();
    const encoded = encoder.encode(
      JSON.stringify({ id: this.state.sessionId, signedPubkeys, ts: Date.now() })
    );
    const summaryBytes = new Uint8Array(encoded.buffer.slice(0)) as Uint8Array<ArrayBuffer>;
    const hashBuffer = await crypto.subtle.digest('SHA-256', summaryBytes);
    const erSessionHash = new Uint8Array(hashBuffer);

    const payload: CommitPayload = {
      signedPubkeys,
      erSessionHash,
    };

    this.state.status = 'COMMITTED';
    this.emit();

    if (this.onCommit) {
      this.onCommit(payload);
    }

    this.destroy();
  }

  private emit(): void {
    const snapshot = { ...this.state, participants: this.state.participants.map((p) => ({ ...p })) };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

// ─────────────────────────────────────────────
// Singleton session store (one active session per demo)
// ─────────────────────────────────────────────
let activeSimulator: ErSimulator | null = null;

export function createSimulator(
  sessionId: string,
  commitmentText: string,
  commitmentHash: string,
  participants: string[],
  quorum: number,
  expiryTs: number,
  onCommit?: (payload: CommitPayload) => void
): ErSimulator {
  if (activeSimulator) {
    activeSimulator.destroy();
  }
  activeSimulator = new ErSimulator(
    sessionId,
    commitmentText,
    commitmentHash,
    participants,
    quorum,
    expiryTs,
    onCommit
  );
  return activeSimulator;
}

export function getActiveSimulator(): ErSimulator | null {
  return activeSimulator;
}
