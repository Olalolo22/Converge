import React, { useEffect, useRef } from 'react';
import type { ConvergeCommitRecord } from '../types/converge';
import { explorerUrl } from '../services/solana';

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

  useEffect(() => {
    if (confettiFiredRef.current) return;
    confettiFiredRef.current = true;

    import('canvas-confetti').then((m) => {
      const confetti = m.default;
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.4 },
        colors: ['#10b981', '#a855f7', '#34d399', '#f4f4f5'],
      });
    });
  }, []);

  function handleCopyProofJson() {
    const jsonStr = JSON.stringify({
      protocol: 'Converge · MagicBlock Ephemeral Rollup',
      sessionId: record.session,
      context: context || 'Co-Signature Agreement',
      commitmentText,
      commitmentHash: record.commitmentHash,
      erSessionHash: record.erSessionHash,
      quorum: record.quorum,
      signedCount: record.signedPubkeys.len ?? record.signedPubkeys.length,
      signedPubkeys: record.signedPubkeys,
      committedAt: record.committedAt,
      timestampISO: new Date(record.committedAt * 1000).toISOString(),
    }, null, 2);

    navigator.clipboard.writeText(jsonStr);
    alert('Canonical Proof JSON copied to clipboard!');
  }

  return (
    <div className="page" style={{ padding: '80px 0' }}>
      <div className="container" style={{ maxWidth: '820px' }}>
        {/* Certificate Container */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--emerald-border)', borderRadius: 'var(--r-md)', padding: '48px', position: 'relative', overflow: 'hidden' }}>
          {/* Top Seal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '24px' }}>
            <div>
              <div className="section-label" style={{ marginBottom: '6px' }}>
                <span className="pulse-dot pulse-dot--emerald" />
                VERIFIED SOLANA SETTLEMENT PROOF
              </div>
              <h1 className="font-serif" style={{ fontSize: '2.5rem', lineHeight: 1.1 }}>
                Canonical Co-Signature Certificate.
              </h1>
            </div>

            <span className="badge-tag badge-tag--active" style={{ fontSize: '11px', padding: '6px 14px' }}>
              ✓ COMMITTED & UNDELEGATED
            </span>
          </div>

          {/* Context & Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Session Context
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', color: 'var(--text-primary)', marginTop: '4px' }}>
                {context || 'Co-Signature Session'}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Settlement Timestamp
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', marginTop: '6px' }}>
                {formatTs(record.committedAt)}
              </div>
            </div>
          </div>

          {/* Signed Text Box */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Committed Agreement Statement
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.6, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '16px', borderRadius: '4px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
              {commitmentText}
            </div>
          </div>

          {/* Cryptographic Hashes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                SHA-256 Commitment Hash
              </div>
              <div className="proof-box" style={{ marginTop: '4px', padding: '10px 14px' }}>
                {record.commitmentHash}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                MagicBlock ER Session State Hash
              </div>
              <div className="proof-box" style={{ marginTop: '4px', padding: '10px 14px' }}>
                {record.erSessionHash}
              </div>
            </div>
          </div>

          {/* Signers List */}
          <div style={{ marginBottom: '36px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Validated Signer Pubkeys ({record.signedPubkeys.length} of {record.quorum} Quorum Met)
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {record.signedPubkeys.map((pubkey) => (
                <div key={pubkey} className="signer-row--signed" style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid var(--emerald-border)', background: 'var(--emerald-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--emerald)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>✓</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)' }}>
                    {pubkey}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: '24px' }}>
            <button type="button" className="btn btn--emerald" onClick={handleCopyProofJson}>
              ✦ Copy Proof JSON
            </button>

            <a
              href={explorerUrl(record.session)}
              target="_blank"
              rel="noreferrer"
              className="btn btn--ghost"
            >
              View on Solana Explorer ↗
            </a>

            <button type="button" className="btn btn--ghost" onClick={onNewRoom} style={{ marginLeft: 'auto' }}>
              + Open New Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
