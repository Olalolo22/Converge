import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type {
  ErSessionState,
  ErParticipantState,
  AppMode,
  CreateRoomForm,
  ConvergeCommitRecord,
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

function getParticipantLabel(pubkey: string): string {
  const demo = DEMO_PARTICIPANTS.find((p) => p.pubkey === pubkey);
  if (demo) return demo.name;
  return shortenAddr(pubkey);
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
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const expiryTs = Math.floor(Date.now() / 1000) + form.expiryMinutes * 60;

  useEffect(() => {
    if (!simulator) return;
    const unsub = simulator.subscribe((state) => {
      setErState(state);

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

      if (state.status === 'EXPIRED') {
        onExpired();
      }
    });
    return unsub;
  }, [simulator, sessionId, commitmentHash, onCommitted, onExpired]);

  // Countdown timer tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(expiryTs));
    }, 1000);
    setCountdown(formatCountdown(expiryTs));
    return () => clearInterval(timer);
  }, [expiryTs]);

  // Auto-join connected wallet to simulator session
  useEffect(() => {
    if (!simulator || !publicKey) return;
    const userPubkey = publicKey.toBase58();
    if (form.participantAddresses.includes(userPubkey)) {
      simulator.join(userPubkey);

      heartbeatRef.current = setInterval(() => {
        simulator.heartbeat(userPubkey);
      }, 5000);
    }
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [simulator, publicKey, form.participantAddresses]);

  function handleJoinSelf() {
    if (!simulator || !publicKey) return;
    simulator.join(publicKey.toBase58());
  }

  function handleSignSelf() {
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

  function handleSimulateParticipantAction(pubkey: string, action: 'join' | 'sign') {
    if (!simulator) return;
    if (action === 'join') simulator.join(pubkey);
    if (action === 'sign') simulator.sign(pubkey);
  }

  const myPubkeyStr = publicKey?.toBase58();
  const myState = erState?.participants.find((p) => p.pubkey === myPubkeyStr);
  const signedCount = erState?.signedCount ?? 0;
  const quorum = erState?.quorum ?? form.quorum;
  const quorumPercentage = Math.min(100, Math.round((signedCount / quorum) * 100));

  return (
    <div className="page" style={{ padding: '0 0 80px 0' }}>
      {/* ── CHAMBER HERO BANNER ── */}
      <div style={{ position: 'relative', minHeight: '380px', backgroundImage: "url('/chamber-bg.png')", backgroundSize: 'cover', backgroundPosition: 'center 30%', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', padding: '100px 0 50px' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(8,8,10,0.85) 0%, rgba(18,18,23,0.7) 100%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, var(--bg-void), transparent)' }} />

        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <div className="section-label">
                <span className="pulse-dot pulse-dot--emerald" />
                LIVE EPHEMERAL ROLLUP CHAMBER // SUB-10MS LATENCY
              </div>
              <h1 className="font-serif" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1.05 }}>
                {form.context || 'Co-Signature Chamber'}
              </h1>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                SESSION ID: {sessionId} &middot; DELEGATED TO MAGICBLOCK ER
              </div>
            </div>

            {/* Countdown & Quorum Telemetry */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '14px 20px', borderRadius: '4px', textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Chamber Expiry
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', color: 'var(--amber)', fontWeight: 500 }}>
                  {countdown}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--emerald-border)', padding: '14px 20px', borderRadius: '4px', textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--emerald)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Quorum Status
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', color: 'var(--emerald)', fontWeight: 600 }}>
                  {signedCount} / {quorum}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ marginTop: '40px' }}>
        {/* Progress Bar */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span>QUORUM CONVERGENCE PROGRESS</span>
            <span>{quorumPercentage}% SATISFIED</span>
          </div>
          <div style={{ height: '4px', background: 'var(--bg-card)', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <div style={{ height: '100%', width: `${quorumPercentage}%`, background: 'var(--emerald)', transition: 'width 0.4s ease' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.9fr)', gap: '30px' }}>
          {/* Left Column: Agreement & Key Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Agreement Terms */}
            <div className="panel">
              <div className="section-label">AGREEMENT COMMITMENT STATEMENT</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', background: 'var(--bg-input)', padding: '18px', border: '1px solid var(--border-subtle)', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                {commitmentText}
              </div>
              <div style={{ marginTop: '12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-mono)', wordBreak: 'break-all' }}>
                SHA-256: {commitmentHash}
              </div>
            </div>

            {/* My Key Action Box */}
            <div className="panel" style={{ border: '1px solid var(--emerald-border)' }}>
              <div className="section-label">YOUR SIGNING IDENTITY</div>
              {publicKey ? (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    Connected Key: {publicKey.toBase58()}
                  </div>

                  {!myState?.present ? (
                    <button type="button" className="btn btn--ghost" onClick={handleJoinSelf} style={{ width: '100%' }}>
                      + Step into Chamber (Join Session)
                    </button>
                  ) : myState?.signed ? (
                    <div style={{ padding: '14px', background: 'var(--emerald-dim)', border: '1px solid var(--emerald-border)', color: 'var(--emerald)', fontFamily: 'var(--font-mono)', fontSize: '12px', borderRadius: '4px', textAlign: 'center' }}>
                      ✓ Your signature is registered in the Ephemeral Rollup state chamber.
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--emerald"
                      onClick={handleSignSelf}
                      disabled={isSigning}
                      style={{ width: '100%', padding: '16px', fontSize: '12px' }}
                    >
                      {isSigning ? 'Signing in ER State...' : '✦ Sign Agreement (Zero Gas)'}
                    </button>
                  )}

                  {signError && (
                    <div style={{ marginTop: '10px', color: 'var(--crimson)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      {signError}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  Connect your Solana wallet using the header button to sign this session.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Participant Presence Map */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="panel">
              <div className="section-label">SIGNER PRESENCE RADAR</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {erState?.participants.map((p) => {
                  const isMe = p.pubkey === myPubkeyStr;
                  const label = getParticipantLabel(p.pubkey);
                  return (
                    <div
                      key={p.pubkey}
                      className={`signer-row ${p.signed ? 'signer-row--signed' : ''}`}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`pulse-dot ${p.present ? 'pulse-dot--emerald' : 'dot--muted'}`} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {label}
                          </span>
                          {isMe && (
                            <span className="badge-tag badge-tag--active" style={{ fontSize: '9px', padding: '1px 5px' }}>
                              You
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {shortenAddr(p.pubkey)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {p.signed ? (
                          <span className="badge-tag badge-tag--active" style={{ fontSize: '10px' }}>
                            ✓ Signed
                          </span>
                        ) : p.present ? (
                          <span className="badge-tag" style={{ fontSize: '10px' }}>
                            Live in Room
                          </span>
                        ) : (
                          <span className="badge-tag" style={{ fontSize: '10px', opacity: 0.5 }}>
                            Absent
                          </span>
                        )}

                        {/* Simulator Action Controls for Demo */}
                        {mode === 'simulator' && !p.signed && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {!p.present && (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                style={{ padding: '4px 8px', fontSize: '9px' }}
                                onClick={() => handleSimulateParticipantAction(p.pubkey, 'join')}
                              >
                                Join
                              </button>
                            )}
                            {p.present && (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                style={{ padding: '4px 8px', fontSize: '9px', borderColor: 'var(--emerald)' }}
                                onClick={() => handleSimulateParticipantAction(p.pubkey, 'sign')}
                              >
                                Sign
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {mode === 'simulator' && (
                <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
                  💡 SIMULATOR CONTROLS: Click &quot;Join&quot; or &quot;Sign&quot; on participant rows to simulate live co-signers reaching quorum.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
