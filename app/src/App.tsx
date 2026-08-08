import React, { useState, useMemo } from 'react';
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
} from './types/converge';
import { hashToHex, ER_RPC } from './services/solana';
import { createSimulator, ErSimulator } from './services/simulator';

// ─────────────────────────────────────────────
// Solana Provider Bridge (Module Level)
// ─────────────────────────────────────────────
const CP  = ConnectionProvider  as React.ComponentType<{ endpoint: string; children: React.ReactNode }>;
const WP  = WalletProvider      as React.ComponentType<{ wallets: any[]; autoConnect: boolean; children: React.ReactNode }>;
const WMP = WalletModalProvider as React.ComponentType<{ children: React.ReactNode }>;

function SolanaProviders({ children, wallets }: { children: React.ReactNode; wallets: any[] }) {
  return (
    <CP endpoint={ER_RPC}>
      <WP wallets={wallets} autoConnect>
        <WMP>{children}</WMP>
      </WP>
    </CP>
  );
}

// ─────────────────────────────────────────────
// App Component
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
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

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
    const ctx: SessionCtx = { sessionId, commitmentText, commitmentHash, form };
    setSession(ctx);

    const expiryTs = Math.floor(Date.now() / 1000) + form.expiryMinutes * 60;
    const sim = createSimulator(
      sessionId,
      commitmentText,
      commitmentHash,
      form.participantAddresses,
      form.quorum,
      expiryTs,
      (payload) => {
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

    setSimulator(sim);
    setView('room');
  }

  function handleCommitted(record: ConvergeCommitRecord) {
    setCommitRecord(record);
    setView('proof');
  }

  function renderContent() {
    switch (view) {
      case 'home':
        return <HomePage onStart={handleGoCreate} mode={mode} />;
      case 'create':
        return <CreateRoom mode={mode} onSessionCreated={handleSessionCreated} />;
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
            onExpired={() => {}}
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
    <SolanaProviders wallets={wallets}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header mode={mode} onModeChange={setMode} onLogoClick={handleGoHome} />
        <main style={{ flex: 1, paddingTop: '72px' }}>{renderContent()}</main>
      </div>
    </SolanaProviders>
  );
}

// ─────────────────────────────────────────────
// Narrative Editorial Home Page
// ─────────────────────────────────────────────
function HomePage({ onStart, mode }: { onStart: () => void; mode: AppMode }) {
  return (
    <div className="page">
      {/* ── HERO WITH IMAGE STORY ── */}
      <header className="hero">
        <div className="hero__overlay" />
        <div className="hero__vignette" />

        <div className="hero__content">
          <div className="hero__eyebrow">
            <span className="pulse-dot pulse-dot--emerald" />
            MAGICBLOCK EPHEMERAL ROLLUPS &middot; SOLANA DEVNET
          </div>

          <h1 className="hero__title">
            <span>The Room Was Ephemeral.</span>
            <span className="hero__title-italic">The Proof Is Permanent.</span>
          </h1>
        </div>

        <div className="hero__footer">
          <p className="hero__subtitle">
            Multiple keys enter a zero-latency off-chain rollup chamber on MagicBlock. When quorum converges, a single atomic proof settles to Solana base layer.
          </p>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={onStart}>
              ✦ Open Co-Signature Room
            </button>
            <a href="#how" className="btn btn--ghost">
              View Architecture ↓
            </a>
          </div>
        </div>
      </header>

      {/* ── TELEMETRY BAND ── */}
      <section className="stats-band">
        <div className="container">
          <div className="stats-grid">
            <div>
              <div className="stat-item__val">&lt;10ms</div>
              <div className="stat-item__lbl">Ephemeral Rollup Actions</div>
            </div>
            <div>
              <div className="stat-item__val">1 Tx</div>
              <div className="stat-item__lbl">Solana Base Settlement</div>
            </div>
            <div>
              <div className="stat-item__val">100%</div>
              <div className="stat-item__lbl">Atomic Quorum Proof</div>
            </div>
            <div>
              <div className="stat-item__val">0 SOL</div>
              <div className="stat-item__lbl">Gas Spent During Signing</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 01: THE IMPERATIVE ── */}
      <section id="problem" className="editorial-section">
        <div className="container">
          <div className="grid-problem">
            <div style={{ position: 'sticky', top: '110px' }}>
              <div className="section-label">01 // THE IMPERATIVE</div>
              <h2 className="font-serif" style={{ fontSize: 'clamp(2.4rem,4.4vw,3.8rem)', lineHeight: 1.05 }}>
                L1 Multi-Sig is slow, expensive, and blind to presence.
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontSize: '17px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              <p>
                Every partial signature in traditional L1 multisig is a distinct base-layer transaction. Signers wait through block latency, pay transaction fees for partial states, and coordinate blind over Telegram—unaware of who is actually active in the signing session.
              </p>
              <p>
                When timing matters—treasury approvals, emergency key rotations, or multi-party agreement locks—base layer transaction queues introduce dangerous delays and fragmented state history.
              </p>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '24px', marginTop: '12px' }}>
                <p className="font-serif" style={{ fontStyle: 'italic', fontSize: '1.8rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  Signers need a live, zero-latency chamber—where actions happen instantaneously and only the final quorum settles to the blockchain.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 02: PARADIGM SHIFT ── */}
      <section className="editorial-section" style={{ background: 'var(--bg-dark)' }}>
        <div className="container">
          <div style={{ maxWidth: '720px', marginBottom: '50px' }}>
            <div className="section-label">02 // PARADIGM SHIFT</div>
            <h2 className="font-serif" style={{ fontSize: 'clamp(2.4rem,4.4vw,3.8rem)' }}>
              Ephemeral Rollups vs Traditional L1 Multisig.
            </h2>
          </div>

          <div className="grid-comparative">
            <div className="panel-old">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Traditional L1 Multisig
              </div>
              <h3 className="font-serif" style={{ fontSize: '1.7rem', color: 'var(--text-secondary)' }}>
                5 Signers = 5 Base Layer Transactions.
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Every key signature is pushed individually to Solana base layer. High fee overhead, noisy block history, and zero real-time presence awareness during signing.
              </p>
            </div>

            <div className="panel-new">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--emerald)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Converge Ephemeral Chamber
              </div>
              <h3 className="font-serif" style={{ fontSize: '1.7rem', color: 'var(--text-primary)' }}>
                Sub-10ms Chamber Signatures. 1 Settlement Tx.
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Session PDA is delegated to a MagicBlock Ephemeral Rollup validator. Presence heartbeats sync live off-chain. Upon quorum, the state flushes back to Solana base layer in 1 single atomic transaction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 03: HOW IT WORKS ── */}
      <section id="how" className="editorial-section">
        <div className="container">
          <div style={{ maxWidth: '720px', marginBottom: '60px' }}>
            <div className="section-label">03 // ARCHITECTURE</div>
            <h2 className="font-serif" style={{ fontSize: 'clamp(2.4rem,4.4vw,3.8rem)' }}>
              From Ephemeral Chamber to Permanent Solana Proof.
            </h2>
          </div>

          {[
            {
              num: '01',
              title: 'Delegation & Chamber Init',
              body: 'The session creator defines the participant pubkey whitelist and quorum threshold. The ConvergeSession PDA is initialized on Solana base layer and immediately delegated to MagicBlock Ephemeral Rollup.',
            },
            {
              num: '02',
              title: 'Synchronous Live Chamber',
              body: 'Wallets connect to the Ephemeral Rollup RPC (<10ms latency). High-frequency heartbeat ticks verify participant presence in real-time. Signing actions execute in-memory with zero SOL gas spent per signature.',
            },
            {
              num: '03',
              title: 'Atomic Settlement & Proof',
              body: 'When ER detects signed count ≥ quorum, MagicBlock flushes the session state back to Solana base layer, undelegating the PDA and creating an immutable ConvergeCommitRecord account as permanent proof.',
            },
          ].map((step) => (
            <div key={step.num} className="step-row">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--emerald)', letterSpacing: '0.08em' }}>
                {step.num}
              </div>
              <div className="font-serif" style={{ fontSize: '1.7rem', lineHeight: 1.1 }}>
                {step.title}
              </div>
              <div style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                {step.body}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
