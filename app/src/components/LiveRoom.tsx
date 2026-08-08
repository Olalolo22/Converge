import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { CheckCircle2, Circle, Heart, LogIn, Pen, Timer, Users, Zap } from 'lucide-react';
import type {
  ErSessionState,
  ErParticipantState,
  AppMode,
  CreateRoomForm,
  CommitPayload,
  ConvergeCommitRecord,
  SimParticipant,
} from '../types/converge';
import { DEMO_PARTICIPANTS } from '../types/converge';
import { formatCountdown } from '../services/solana';
import { ErSimulator } from '../services/simulator';

interface LiveRoomProps {
  mode: AppMode;
  sessionId: string;
  commitmentText: string;
  commitmentHash: string;
  form: CreateRoomForm;
  simulator: ErSimulator | null;
  onCommitted: (record: ConvergeCommitRecord) => void;
  onExpired: () => void;
}

function shortenAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function getParticipantLabel(pubkey: string, form: CreateRoomForm): string {
  const demo = DEMO_PARTICIPANTS.find((p) => p.pubkey === pubkey);
  if (demo) return demo.name;
  return shortenAddr(pubkey);
}

function getParticipantColor(pubkey: string): string {
  const demo = DEMO_PARTICIPANTS.find((p) => p.pubkey === pubkey);
  if (demo) return demo.color;
  // Deterministic color from pubkey
  const colors = ['#a78bfa', '#34d399', '#60a5fa', '#f472b6', '#fbbf24'];
  const idx = pubkey.charCodeAt(0) % colors.length;
  return colors[idx];
}

function getInitial(pubkey: string): string {
  const demo = DEMO_PARTICIPANTS.find((p) => p.pubkey === pubkey);
  if (demo) return demo.name[0];
  return pubkey[0].toUpperCase();
}

export function LiveRoom({
  mode,
  sessionId,
  commitmentText,
  commitmentHash,
  form,
  simulator,
  onCommitted,
  onExpired,
}: LiveRoomProps) {
  const { publicKey } = useWallet();

  const [erState, setErState] = useState<ErSessionState | null>(null);
  const [countdown, setCountdown] = useState('');
  const [myParticipant, setMyParticipant] = useState<ErParticipantState | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [signError, setSignError] = useState('');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const expiryTs = Math.floor(Date.now() / 1000) + form.expiryMinutes * 60;

  // Subscribe to simulator state
  useEffect(() => {
    if (!simulator) return;
    const unsub = simulator.subscribe((state) => {
      setErState(state);

      // Check if committed
      if (state.status === 'COMMITTED') {
        const signedPubkeys = state.participants.filter((p) => p.signed).map((p) => p.pubkey);
        const record: ConvergeCommitRecord = {
          session: sessionId,
          commitmentHash,
          signedPubkeys,
          quorum: state.quorum,
          committedAt: Math.floor(Date.now() / 1000),
          erSessionHash: `sim-er-hash-${sessionId}`,
        };
        onCommitted(record);
      }

      // Check expired
      if (state.status === 'EXPIRED') {
        onExpired();
      }
    });
    return unsub;
  }, [simulator, sessionId, commitmentHash, onCommitted, onExpired]);

  // Track my participant
  useEffect(() => {
    if (!erState || !publicKey) return;
    const me = erState.participants.find((p) => p.pubkey === publicKey.toBase58());
    setMyParticipant(me ?? null);
  }, [erState, publicKey]);

  // Countdown timer
  useEffect(() => {
    const tick = () => {
      const ts = erState?.expiryTs ?? expiryTs;
      const c = formatCountdown(ts);
      setCountdown(c);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [erState?.expiryTs, expiryTs]);

  // Auto-join in simulator if my wallet is a participant
  useEffect(() => {
    if (!simulator || !publicKey || mode !== 'simulator') return;
    const myAddr = publicKey.toBase58();
    if (form.participantAddresses.includes(myAddr)) {
      simulator.join(myAddr);
    }
  }, [simulator, publicKey, form.participantAddresses, mode]);

  // Auto-heartbeat
  useEffect(() => {
    if (!simulator || !publicKey) return;
    const myAddr = publicKey.toBase58();
    heartbeatRef.current = setInterval(() => {
      try { simulator.heartbeat(myAddr); } catch (_) {}
    }, 5000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [simulator, publicKey]);

  function handleJoin(pubkey: string) {
    if (!simulator) return;
    setIsJoining(true);
    try {
      simulator.join(pubkey);
    } catch (e: any) {
      setSignError(e?.message ?? 'Failed to join');
    } finally {
      setIsJoining(false);
    }
  }

  function handleSign() {
    if (!simulator || !publicKey) return;
    setSignError('');
    setIsSigning(true);
    try {
      simulator.sign(publicKey.toBase58());
    } catch (e: any) {
      setSignError(e?.message ?? 'Failed to sign');
    } finally {
      setIsSigning(false);
    }
  }

  function handleSimParticipantAction(demo: SimParticipant) {
    if (!simulator) return;
    const state = simulator.getState();
    const p = state.participants.find((x) => x.pubkey === demo.pubkey);
    if (!p) return;

    if (!p.present) {
      simulator.join(demo.pubkey);
    } else if (!p.signed) {
      simulator.sign(demo.pubkey);
    }
  }

  const status = erState?.status ?? 'OPEN';
  const signedCount = erState?.signedCount ?? 0;
  const hasQuorum = erState?.hasQuorum ?? false;
  const participants = erState?.participants ?? form.participantAddresses.map((pk) => ({
    pubkey: pk,
    present: false,
    signed: false,
    lastHeartbeat: 0,
  }));

  const remaining = Math.max(0, expiryTs - Math.floor(Date.now() / 1000));
  const isWarning = remaining < 60;
  const isDanger = remaining < 15;

  const countdownClass = isDanger
    ? 'countdown--danger'
    : isWarning
    ? 'countdown--warning'
    : '';

  const statusBadgeClass =
    status === 'COMMITTED' ? 'badge-committed' :
    status === 'EXPIRED'   ? 'badge-expired' :
    status === 'COMMITTING'? 'badge-signed' :
    'badge-open';

  const iAmParticipant = publicKey && form.participantAddresses.includes(publicKey.toBase58());
  const iAmPresent = myParticipant?.present ?? false;
  const iAmSigned = myParticipant?.signed ?? false;
  const canSign = iAmPresent && !iAmSigned && (status === 'OPEN' || status === 'SIGNING');

  return (
    <div className="page animate-fade-in">
      <div className="container">
        {/* ── Room header ── */}
        <div className="room-header">
          <div>
            <h1 className="room-title">
              Converge Room
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <span className={`badge ${statusBadgeClass}`}>
                <span className={`pulse-dot ${
                  status === 'COMMITTED' ? 'pulse-dot--green' :
                  status === 'EXPIRED' ? 'pulse-dot--gray' :
                  'pulse-dot--green'
                }`} />
                {status}
              </span>
              {form.context && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {form.context}
                </span>
              )}
            </div>
          </div>

          {/* Countdown + quorum counter */}
          <div style={{ textAlign: 'right' }}>
            <div className={`countdown ${countdownClass}`}>
              {status === 'EXPIRED' ? '00:00' : countdown}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {status === 'EXPIRED' ? 'SESSION EXPIRED' : 'REMAINING'}
            </div>
          </div>
        </div>

        {/* ── Signed counter + progress ── */}
        <div className="card mb-2">
          <div className="card__body">
            <div className="flex-between mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div className="signed-counter">
                  {signedCount} / {form.quorum}
                </div>
                <div className="signed-counter-label">Signatures</div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <div><strong>{form.participantAddresses.length}</strong> participants</div>
                <div><strong>{form.quorum}</strong> required</div>
              </div>
            </div>

            <div className="progress-container">
              <div
                className="progress-bar"
                style={{ width: `${Math.min(100, (signedCount / form.quorum) * 100)}%` }}
              />
            </div>

            {hasQuorum && status !== 'COMMITTED' && (
              <div className="alert alert--success mt-2">
                <Zap size={16} />
                <span>
                  <strong>QUORUM REACHED</strong> — Committing to Solana via MagicBlock ER…
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid-2">
          {/* ── Commitment ── */}
          <div className="card">
            <div className="card__header flex-center gap-1">
              <Pen size={14} style={{ color: 'var(--accent-teal)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Commitment</span>
            </div>
            <div className="card__body">
              <div className="commitment-box">
                <div className="commitment-text">{commitmentText}</div>
                <div className="commitment-hash">
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>SHA-256</span>
                  <br />
                  {commitmentHash}
                </div>
              </div>

              {/* ER vs Solana status note */}
              <div className="alert alert--info mt-2" style={{ fontSize: '0.8rem' }}>
                <span className="pulse-dot pulse-dot--purple" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Presence &amp; signing tracked in <strong>MagicBlock ER</strong>.
                  No Solana tx per action — only final commit settles to base layer.
                </span>
              </div>
            </div>
          </div>

          {/* ── Participants ── */}
          <div className="card">
            <div className="card__header flex-center gap-1">
              <Users size={14} style={{ color: 'var(--accent-purple)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Participants</span>
            </div>
            <div className="card__body">
              <div className="participants-list">
                {participants.map((p) => (
                  <div
                    key={p.pubkey}
                    className={`participant-card ${p.present ? 'participant-card--present' : ''} ${p.signed ? 'participant-card--signed' : ''}`}
                  >
                    {/* Avatar */}
                    <div
                      className="participant-avatar"
                      style={{
                        background: `${getParticipantColor(p.pubkey)}22`,
                        color: getParticipantColor(p.pubkey),
                        border: `1px solid ${getParticipantColor(p.pubkey)}44`,
                      }}
                    >
                      {getInitial(p.pubkey)}
                    </div>

                    {/* Info */}
                    <div className="participant-info">
                      <div className="participant-name">
                        {getParticipantLabel(p.pubkey, form)}
                        {publicKey?.toBase58() === p.pubkey && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>(you)</span>
                        )}
                      </div>
                      <div className="participant-pubkey">{shortenAddr(p.pubkey)}</div>
                    </div>

                    {/* Status badges */}
                    <div className="participant-badges">
                      <span className={`badge ${p.present ? 'badge-present' : 'badge-absent'}`}>
                        {p.present ? (
                          <><span className="pulse-dot pulse-dot--green" /> PRESENT</>
                        ) : (
                          <><span className="pulse-dot pulse-dot--gray" /> ABSENT</>
                        )}
                      </span>
                      <span className={`badge ${p.signed ? 'badge-signed' : 'badge-waiting'}`}>
                        {p.signed ? (
                          <><CheckCircle2 size={10} /> SIGNED</>
                        ) : (
                          <><Circle size={10} /> WAITING</>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Simulator quick-controls */}
              {mode === 'simulator' && (
                <div className="mt-3">
                  <div className="section-label">Quick simulate</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {DEMO_PARTICIPANTS.filter((d) =>
                      form.participantAddresses.includes(d.pubkey)
                    ).map((demo) => {
                      const p = participants.find((x) => x.pubkey === demo.pubkey);
                      const action = !p?.present ? 'Join' : !p?.signed ? 'Sign' : '✓';
                      return (
                        <button
                          key={demo.pubkey}
                          id={`sim-btn-${demo.name.toLowerCase()}`}
                          className="btn btn-ghost btn-sm"
                          style={{
                            borderColor: demo.color + '44',
                            color: demo.color,
                            fontSize: '0.75rem',
                          }}
                          disabled={action === '✓' || status !== 'OPEN' && status !== 'SIGNING'}
                          onClick={() => handleSimParticipantAction(demo)}
                        >
                          {action} as {demo.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── My action panel ── */}
        {iAmParticipant && status !== 'COMMITTED' && status !== 'EXPIRED' && (
          <div className="card mt-2">
            <div className="card__body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Your status</div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className={`badge ${iAmPresent ? 'badge-present' : 'badge-absent'}`}>
                    {iAmPresent ? '● PRESENT' : '○ ABSENT'}
                  </span>
                  <span className={`badge ${iAmSigned ? 'badge-signed' : 'badge-waiting'}`}>
                    {iAmSigned ? '✓ SIGNED' : '○ NOT SIGNED'}
                  </span>
                </div>
                {signError && (
                  <div style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.5rem' }}>{signError}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!iAmPresent && (
                  <button
                    id="join-room-btn"
                    className="btn btn-ghost"
                    onClick={() => handleJoin(publicKey!.toBase58())}
                    disabled={isJoining}
                  >
                    <LogIn size={16} />
                    {isJoining ? 'Joining…' : 'Join Room'}
                  </button>
                )}

                {iAmPresent && !iAmSigned && (
                  <button
                    id="sign-commitment-btn"
                    className="btn btn-sign"
                    onClick={handleSign}
                    disabled={!canSign || isSigning}
                  >
                    {isSigning ? (
                      <><span className="spinner" style={{ width: 18, height: 18 }} /> Signing via ER…</>
                    ) : (
                      <>✦ Sign Commitment</>
                    )}
                  </button>
                )}

                {iAmSigned && (
                  <div className="btn btn-ghost" style={{ cursor: 'default', borderColor: 'var(--border-teal)', color: 'var(--accent-teal)' }}>
                    <CheckCircle2 size={16} /> You signed
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Expired notice */}
        {status === 'EXPIRED' && (
          <div className="alert alert--error mt-2">
            <span>
              <strong>Session Expired</strong> — The room timed out before quorum was reached.
              No CoSignCommitRecord was written to Solana.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
