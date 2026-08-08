import React, { useEffect, useRef } from 'react';
import type { ConvergeCommitRecord } from '../types/converge';
import { explorerUrl } from '../services/solana';
import { CheckCircle2, ExternalLink, Shield, Clock, Users } from 'lucide-react';

interface ProofViewProps {
  record: ConvergeCommitRecord;
  commitmentText: string;
  context?: string;
  onNewRoom: () => void;
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'long',
  });
}

export function ProofView({ record, commitmentText, context, onNewRoom }: ProofViewProps) {
  const confettiFiredRef = useRef(false);

  // Confetti celebration on mount
  useEffect(() => {
    if (confettiFiredRef.current) return;
    confettiFiredRef.current = true;

    import('canvas-confetti').then((m) => {
      const confetti = m.default;
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#9945ff', '#14f195', '#60a5fa', '#f472b6'],
      });
      setTimeout(() => {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.4 },
          colors: ['#14f195', '#9945ff'],
        });
      }, 400);
    });
  }, []);

  return (
    <div className="page animate-slide-up">
      <div className="container">
        <div className="proof-container">
          {/* ── Hero ── */}
          <div className="proof-icon">
            <CheckCircle2 size={40} style={{ color: '#14f195' }} />
          </div>

          <h1 style={{ marginBottom: '0.5rem' }}>
            <span style={{ background: 'var(--grad-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Co-Signature Committed
            </span>
          </h1>

          {context && (
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              {context}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-committed">
              <span className="pulse-dot pulse-dot--green" />
              COMMITTED
            </span>
            <span className="badge badge-open">
              ✦ Proof on Solana
            </span>
            <span className="badge" style={{ background: 'rgba(153,69,255,0.1)', color: 'var(--accent-purple)', border: '1px solid var(--border-purple)' }}>
              Via MagicBlock ER
            </span>
          </div>

          {/* ── Commitment proof card ── */}
          <div className="card mb-2 text-left">
            <div className="card__header flex-center gap-1">
              <Shield size={16} style={{ color: 'var(--accent-teal)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Commitment</span>
            </div>
            <div className="card__body">
              <div className="section-label">Signed text</div>
              <div className="commitment-box mb-2" style={{ marginBottom: '1rem' }}>
                <div className="commitment-text">{commitmentText}</div>
              </div>

              <div className="section-label">SHA-256 commitment hash</div>
              <div className="proof-hash">{record.commitmentHash}</div>
            </div>
          </div>

          {/* ── Signers ── */}
          <div className="card mb-2 text-left">
            <div className="card__header flex-between">
              <div className="flex-center gap-1">
                <Users size={16} style={{ color: 'var(--accent-purple)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Signers</span>
              </div>
              <span className="badge badge-signed">
                {record.signedPubkeys.length} / {record.quorum} quorum
              </span>
            </div>
            <div className="card__body">
              <div className="signer-pills">
                {record.signedPubkeys.map((pk) => (
                  <div key={pk} className="signer-pill">
                    <CheckCircle2 size={12} style={{ color: 'var(--accent-teal)' }} />
                    <code style={{ fontSize: '0.75rem' }}>{shortenAddr(pk)}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Settlement metadata ── */}
          <div className="card mb-3 text-left">
            <div className="card__header flex-center gap-1">
              <Clock size={16} style={{ color: 'var(--accent-amber)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Settlement</span>
            </div>
            <div className="card__body">
              <div className="grid-2" style={{ gap: '1rem' }}>
                <div>
                  <div className="section-label">Committed at</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {formatTs(record.committedAt)}
                  </div>
                </div>
                <div>
                  <div className="section-label">Session</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    {record.session}
                  </div>
                </div>
              </div>

              {record.erSessionHash && (
                <div className="mt-2">
                  <div className="section-label">ER session hash</div>
                  <div className="proof-hash" style={{ fontSize: '0.7rem' }}>
                    {record.erSessionHash}
                  </div>
                </div>
              )}

              {/* Solana Explorer link */}
              {record.txSignature && (
                <a
                  id="explorer-link"
                  href={explorerUrl(record.txSignature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost mt-2 w-full"
                  style={{ justifyContent: 'center' }}
                >
                  <ExternalLink size={16} />
                  View on Solana Explorer
                </a>
              )}
            </div>
          </div>

          {/* ── ER narrative ── */}
          <div className="alert alert--info mb-3" style={{ textAlign: 'left' }}>
            <span className="pulse-dot pulse-dot--purple" style={{ flexShrink: 0, marginTop: 4 }} />
            <span style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
              <strong>The room was ephemeral. The proof is permanent.</strong>
              <br />
              All presence tracking, heartbeats, and signing happened inside the
              MagicBlock Ephemeral Rollup — zero Solana writes per action.
              Only this final <code>ConvergeCommitRecord</code> settled to Solana.
            </span>
          </div>

          {/* ── CTA ── */}
          <button
            id="new-room-btn"
            className="btn btn-primary w-full"
            style={{ padding: '1rem', fontSize: '1rem', borderRadius: 'var(--r-lg)' }}
            onClick={onNewRoom}
          >
            ✦ Create Another Room
          </button>
        </div>
      </div>
    </div>
  );
}
