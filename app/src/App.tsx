import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

import { Header } from './components/Header';
import { CreateRoom } from './components/CreateRoom';
import { LiveRoom } from './components/LiveRoom';
import { ProofView } from './components/ProofView';

import type {
  AppMode,
  AppView,
  CreateRoomForm,
  ConvergeCommitRecord,
  SimParticipant,
} from './types/converge';
import { DEMO_PARTICIPANTS } from './types/converge';
import { hashToHex, ER_RPC } from './services/solana';
import { createSimulator, ErSimulator } from './services/simulator';

// ─────────────────────────────────────────────
// App state
// ─────────────────────────────────────────────
interface SessionCtx {
  sessionId: string;
  commitmentText: string;
  commitmentHash: string;
  form: CreateRoomForm;
}

function App() {
  const [mode, setMode] = useState<AppMode>('simulator');
  const [view, setView] = useState<AppView>('home');
  const [session, setSession] = useState<SessionCtx | null>(null);
  const [simulator, setSimulator] = useState<ErSimulator | null>(null);
  const [commitRecord, setCommitRecord] = useState<ConvergeCommitRecord | null>(null);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  // ── Handlers ──────────────────────────────────────────────────────

  function handleModeChange(newMode: AppMode) {
    setMode(newMode);
  }

  function handleGoHome() {
    setView('home');
    setSession(null);
    setSimulator(null);
    setCommitRecord(null);
  }

  function handleGoCreate() {
    setView('create');
    setSession(null);
    setSimulator(null);
    setCommitRecord(null);
  }

  function handleSessionCreated(
    sessionId: string,
    commitmentText: string,
    commitmentHashBytes: Uint8Array,
    form: CreateRoomForm
  ) {
    const commitmentHash = hashToHex(commitmentHashBytes);

    const ctx: SessionCtx = {
      sessionId,
      commitmentText,
      commitmentHash,
      form,
    };
    setSession(ctx);

    // Create simulator
    const expiryTs = Math.floor(Date.now() / 1000) + form.expiryMinutes * 60;
    const sim = createSimulator(
      sessionId,
      commitmentText,
      commitmentHash,
      form.participantAddresses,
      form.quorum,
      expiryTs,
      (payload) => {
        // Auto-commit callback
        const record: ConvergeCommitRecord = {
          session: sessionId,
          commitmentHash,
          signedPubkeys: payload.signedPubkeys,
          quorum: form.quorum,
          committedAt: Math.floor(Date.now() / 1000),
          erSessionHash: hashToHex(payload.erSessionHash),
        };
        setCommitRecord(record);
        setView('proof');
      }
    );

    // Auto-join demo participants if they're in the list
    if (mode === 'simulator') {
      // Pre-populate with Alice/Bob/Charlie if user chose demo addresses
      DEMO_PARTICIPANTS.forEach((dp) => {
        if (form.participantAddresses.includes(dp.pubkey)) {
          // Don't auto-join — let the demo unfold naturally via quick-simulate buttons
        }
      });
    }

    setSimulator(sim);
    setView('room');
  }

  function handleCommitted(record: ConvergeCommitRecord) {
    setCommitRecord(record);
    setView('proof');
  }

  function handleExpired() {
    // Room remains in view with EXPIRED state shown
  }

  // ── Page rendering ────────────────────────────────────────────────

  function renderContent() {
    switch (view) {
      case 'home':
        return <HomePage onStart={handleGoCreate} mode={mode} />;
      case 'create':
        return (
          <CreateRoom
            mode={mode}
            onSessionCreated={handleSessionCreated}
          />
        );
      case 'room':
        if (!session) return null;
        return (
          <LiveRoom
            mode={mode}
            sessionId={session.sessionId}
            commitmentText={session.commitmentText}
            commitmentHash={session.commitmentHash}
            form={session.form}
            simulator={mode === 'simulator' ? simulator : null}
            onCommitted={handleCommitted}
            onExpired={handleExpired}
          />
        );
      case 'proof':
        if (!commitRecord || !session) return null;
        return (
          <ProofView
            record={commitRecord}
            commitmentText={session.commitmentText}
            context={session.form.context}
            onNewRoom={handleGoHome}
          />
        );
      default:
        return null;
    }
  }

  return (
    <ConnectionProvider endpoint={ER_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Header
              mode={mode}
              onModeChange={handleModeChange}
              onLogoClick={handleGoHome}
            />
            <main style={{ flex: 1 }}>
              {renderContent()}
            </main>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

// ─────────────────────────────────────────────
// Home page
// ─────────────────────────────────────────────
function HomePage({ onStart, mode }: { onStart: () => void; mode: AppMode }) {
  return (
    <div className="page">
      <div className="container">
        {/* Hero */}
        <section className="hero">
          <div className="hero__eyebrow">
            <span className="pulse-dot pulse-dot--green" />
            MagicBlock Ephemeral Rollups · Solana Devnet
          </div>
          <h1 className="hero__title">
            The Room Was Ephemeral.
            <br />
            <span>The Proof Is Permanent.</span>
          </h1>
          <p className="hero__subtitle">
            Converge is a live, synchronous co-signature room on Solana.
            Multiple wallets join a shared ephemeral session, sign a commitment in real-time,
            and only the final proof settles to the blockchain.
          </p>
          <div className="hero__cta">
            <button
              id="hero-create-btn"
              className="btn btn-primary"
              style={{ padding: '0.9rem 2.5rem', fontSize: '1.05rem', borderRadius: 'var(--r-lg)' }}
              onClick={onStart}
            >
              ✦ Open a Converge Room
            </button>
          </div>
        </section>

        {/* Architecture strip */}
        <div className="info-strip">
          {[
            {
              icon: '⚡',
              value: '<10ms',
              label: 'Ephemeral Rollup actions',
              color: 'var(--accent-teal)',
            },
            {
              icon: '🔗',
              value: '1 Tx',
              label: 'Solana settlement',
              color: 'var(--accent-purple)',
            },
            {
              icon: '👥',
              value: 'Live',
              label: 'Synchronous presence',
              color: 'var(--accent-blue)',
            },
            {
              icon: '🔒',
              value: 'Atomic',
              label: 'All or nothing proof',
              color: 'var(--accent-pink)',
            },
          ].map((item, i) => (
            <div key={i} className="info-strip__item">
              <span className="info-strip__value" style={{ background: `linear-gradient(135deg, ${item.color}, var(--accent-teal))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {item.value}
              </span>
              <div className="info-strip__label">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Architecture diagram card */}
        <div className="card mt-3" style={{ marginTop: '2rem' }}>
          <div className="card__header">
            <span style={{ fontWeight: 700 }}>How it works</span>
          </div>
          <div className="card__body">
            <div className="grid-2" style={{ gap: '1.5rem' }}>
              {/* ER side */}
              <div style={{ padding: '1.25rem', borderRadius: 'var(--r-md)', background: 'rgba(153,69,255,0.06)', border: '1px solid var(--border-purple)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span className="pulse-dot pulse-dot--purple" />
                  <strong style={{ fontSize: '0.9rem', color: 'var(--accent-purple)' }}>
                    MagicBlock Ephemeral Rollup
                  </strong>
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[
                    '→ Participant presence',
                    '→ Heartbeat / keep-alive',
                    '→ Signing progress',
                    '→ Quorum detection',
                    '→ Session lifecycle',
                  ].map((item) => (
                    <li key={item} style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {item}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Sub-10ms · no L1 write per action
                </div>
              </div>

              {/* Solana side */}
              <div style={{ padding: '1.25rem', borderRadius: 'var(--r-md)', background: 'rgba(20,241,149,0.04)', border: '1px solid var(--border-teal)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span className="pulse-dot pulse-dot--green" />
                  <strong style={{ fontSize: '0.9rem', color: 'var(--accent-teal)' }}>
                    Solana Base Layer
                  </strong>
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[
                    '→ Session configuration',
                    '→ ER delegation record',
                    '→ Final commitment hash',
                    '→ Signing wallet list',
                    '→ Settlement timestamp',
                  ].map((item) => (
                    <li key={item} style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {item}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  1 final tx · immutable proof
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Demo mode note */}
        {mode === 'simulator' && (
          <div className="alert alert--warning mt-3">
            <span>
              <strong>Simulator mode active.</strong> You can demo the full live room flow without a funded wallet.
              Switch to <strong>Real ER</strong> mode in the header to use actual MagicBlock Ephemeral Rollup endpoints for judging.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
