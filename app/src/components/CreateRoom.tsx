import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import type { CreateRoomForm, AppMode } from '../types/converge';
import { computeCommitmentHash, hashToHex } from '../services/solana';

interface CreateRoomProps {
  mode: AppMode;
  onSessionCreated: (
    sessionId: string,
    commitmentText: string,
    commitmentHash: Uint8Array,
    form: CreateRoomForm
  ) => void;
}

const MAX_PARTICIPANTS = 5;

const PRESET_AGREEMENTS = [
  {
    title: 'Founders Token Lock Agreement v1',
    text: 'We, the undersigned founders, agree to commit our multi-sig authority to the 4-year vesting schedule and 1-year cliff as defined in Protocol Spec v1.4. No tokens shall be transferred prior to quorum unlock.',
  },
  {
    title: 'Emergency Multi-Sig Key Rotation',
    text: 'Authorization to execute emergency key rotation for Treasury Vault PDA (pubkey: 9VnuYqz9fkambuAVxXWkHGtf1EpzLzchSFDRvpSwNLWU). Revoking compromised admin key and delegating authority to ER Session.',
  },
];

function isValidPublicKey(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

export function CreateRoom({ mode, onSessionCreated }: CreateRoomProps) {
  const { publicKey } = useWallet();

  const [form, setForm] = useState<CreateRoomForm>({
    commitmentText: '',
    participantAddresses: [],
    quorum: 2,
    expiryMinutes: 10,
    context: '',
    metadataUri: '',
  });

  const [newAddress, setNewAddress] = useState('');
  const [addressError, setAddressError] = useState('');
  const [commitmentHash, setCommitmentHash] = useState('');
  const [commitmentHashBytes, setCommitmentHashBytes] = useState<Uint8Array | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!form.commitmentText.trim()) {
      setCommitmentHash('');
      setCommitmentHashBytes(null);
      return;
    }
    computeCommitmentHash(form.commitmentText).then((bytes) => {
      setCommitmentHash(hashToHex(bytes));
      setCommitmentHashBytes(bytes);
    });
  }, [form.commitmentText]);

  function addAddress() {
    const addr = newAddress.trim();
    setAddressError('');

    if (!addr) return;
    if (!isValidPublicKey(addr)) {
      setAddressError('Invalid Solana public key format');
      return;
    }
    if (form.participantAddresses.includes(addr)) {
      setAddressError('Public key already whitelisted');
      return;
    }
    if (form.participantAddresses.length >= MAX_PARTICIPANTS) {
      setAddressError(`Maximum ${MAX_PARTICIPANTS} signers allowed for MVP`);
      return;
    }

    setForm((f) => {
      const updated = [...f.participantAddresses, addr];
      return {
        ...f,
        participantAddresses: updated,
        quorum: Math.max(1, Math.min(f.quorum, updated.length)),
      };
    });
    setNewAddress('');
  }

  function removeAddress(addr: string) {
    setForm((f) => {
      const updated = f.participantAddresses.filter((a) => a !== addr);
      return {
        ...f,
        participantAddresses: updated,
        quorum: Math.max(1, Math.min(f.quorum, updated.length || 1)),
      };
    });
  }

  function addSelfAsParticipant() {
    if (!publicKey) return;
    const addr = publicKey.toBase58();
    if (form.participantAddresses.includes(addr)) return;
    if (form.participantAddresses.length >= MAX_PARTICIPANTS) return;

    setForm((f) => {
      const updated = [...f.participantAddresses, addr];
      return {
        ...f,
        participantAddresses: updated,
        quorum: Math.max(1, Math.min(f.quorum, updated.length)),
      };
    });
  }

  function applyPreset(preset: typeof PRESET_AGREEMENTS[0]) {
    setForm((f) => ({
      ...f,
      context: preset.title,
      commitmentText: preset.text,
    }));
  }

  async function handleCreate() {
    setError('');
    if (!form.commitmentText.trim()) {
      setError('Agreement text is required');
      return;
    }
    if (form.participantAddresses.length < 1) {
      setError('Add at least one whitelisted participant address');
      return;
    }
    if (form.quorum < 1 || form.quorum > form.participantAddresses.length) {
      setError('Quorum must be between 1 and total signer count');
      return;
    }
    if (!commitmentHashBytes) {
      setError('Computing cryptographic hash...');
      return;
    }

    setIsCreating(true);
    try {
      const sessionId =
        mode === 'simulator' ? `sim-${Date.now()}` : `real-${Date.now()}`;
      onSessionCreated(sessionId, form.commitmentText, commitmentHashBytes, form);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to initialize chamber session');
    } finally {
      setIsCreating(false);
    }
  }

  const canCreate =
    form.commitmentText.trim().length > 0 &&
    form.participantAddresses.length >= 1 &&
    form.quorum >= 1 &&
    form.quorum <= form.participantAddresses.length &&
    !!commitmentHashBytes;

  return (
    <div className="page" style={{ padding: '80px 0 100px' }}>
      <div className="container" style={{ maxWidth: '820px' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <div className="section-label">01 // INITIALIZE CHAMBER</div>
          <h1 className="font-serif" style={{ fontSize: 'clamp(2.6rem, 5.5vw, 4.2rem)', lineHeight: 1.02 }}>
            Co-Signature Session Spec.
          </h1>
          <p style={{ marginTop: '14px', color: 'var(--text-secondary)', fontSize: '16px', maxWidth: '620px' }}>
            Configure agreement commitments, whitelist signer public keys, and set atomic quorum thresholds.
          </p>
        </div>

        {/* Presets */}
        <div style={{ marginBottom: '32px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>
            Quick Presets:
          </span>
          {PRESET_AGREEMENTS.map((p) => (
            <button
              key={p.title}
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: '11px', padding: '6px 14px', borderRadius: '4px' }}
              onClick={() => applyPreset(p)}
            >
              ✦ {p.title}
            </button>
          ))}
        </div>

        {/* Master Instrument Panel */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          
          {/* Section A: Agreement Specification */}
          <div style={{ padding: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="section-label" style={{ marginBottom: '16px' }}>
              SECTION A // AGREEMENT COMMITMENT SPEC
            </div>

            {/* Label */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Session Label
              </label>
              <input
                type="text"
                className="field__input font-mono"
                placeholder="e.g. Founders Token Lock Agreement v1"
                value={form.context}
                maxLength={128}
                onChange={(e) => setForm((f) => ({ ...f, context: e.target.value }))}
                style={{ background: 'var(--bg-void)', border: '1px solid var(--border-bright)', fontSize: '13px', padding: '14px 16px', borderRadius: '4px' }}
              />
            </div>

            {/* Agreement Text Editor Box */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
                  Commitment Text (Hashed to SHA-256)
                </label>
                {commitmentHash && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--emerald)' }}>
                    ✓ SHA-256 READY
                  </span>
                )}
              </div>

              {/* Code Tab Header */}
              <div style={{ background: '#050507', border: '1px solid var(--border-bright)', borderBottom: 'none', borderTopLeftRadius: '4px', borderTopRightRadius: '4px', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  AGREEMENT_PAYLOAD.TXT
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
                  UTF-8 ENCODED
                </span>
              </div>

              <textarea
                className="field__textarea font-mono"
                placeholder="Enter exact terms or commitment text to be cryptographically signed..."
                rows={5}
                value={form.commitmentText}
                onChange={(e) => setForm((f) => ({ ...f, commitmentText: e.target.value }))}
                style={{ background: '#050507', border: '1px solid var(--border-bright)', borderTopLeftRadius: 0, borderTopRightRadius: 0, borderRadius: '0 0 4px 4px', fontSize: '13px', lineHeight: 1.65, padding: '16px', color: '#e4e4e7' }}
              />

              {commitmentHash && (
                <div style={{ marginTop: '12px', background: '#000', border: '1px solid var(--border-subtle)', padding: '12px 16px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-mono)', wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SHA-256 HASH: </span>
                  {commitmentHash}
                </div>
              )}
            </div>
          </div>

          {/* Section B: Whitelisted Signers */}
          <div style={{ padding: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div className="section-label" style={{ marginBottom: 0 }}>
                SECTION B // WHITELISTED SIGNER PUBKEYS
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--emerald)' }}>
                {form.participantAddresses.length} of {MAX_PARTICIPANTS} Keys Whitelisted
              </span>
            </div>

            {/* Input Row */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <input
                type="text"
                className="field__input font-mono"
                placeholder="Solana Public Key (Base58 Address)"
                value={newAddress}
                onChange={(e) => { setNewAddress(e.target.value); setAddressError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && addAddress()}
                style={{ background: 'var(--bg-void)', border: '1px solid var(--border-bright)', fontSize: '13px', padding: '14px 16px', borderRadius: '4px' }}
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={addAddress}
                style={{ flexShrink: 0, padding: '0 24px', borderRadius: '4px' }}
              >
                + Whitelist Key
              </button>
            </div>

            {addressError && (
              <div style={{ color: 'var(--crimson)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginBottom: '16px' }}>
                ⚠ {addressError}
              </div>
            )}

            {publicKey && !form.participantAddresses.includes(publicKey.toBase58()) && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={addSelfAsParticipant}
                style={{ fontSize: '11px', padding: '8px 16px', borderRadius: '4px', marginBottom: '16px' }}
              >
                + Add Connected Key ({publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)})
              </button>
            )}

            {/* Whitelisted Keys List */}
            {form.participantAddresses.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {form.participantAddresses.map((addr, idx) => (
                  <div key={addr} className="signer-row" style={{ background: 'var(--bg-void)', border: '1px solid var(--border-bright)', padding: '12px 18px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                        KEY #{idx + 1}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {addr}
                      </span>
                      {publicKey?.toBase58() === addr && (
                        <span className="badge-tag badge-tag--active" style={{ fontSize: '9px', padding: '2px 8px' }}>
                          Your Wallet
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAddress(addr)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '14px' }}
                      title="Remove key"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px', background: 'var(--bg-void)', border: '1px dashed var(--border-subtle)', borderRadius: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
                No signer public keys added yet. Add at least one Solana wallet address above.
              </div>
            )}
          </div>

          {/* Section C: Quorum & Expiry Configuration */}
          <div style={{ padding: '32px', background: 'var(--bg-dark)' }}>
            <div className="section-label" style={{ marginBottom: '20px' }}>
              SECTION C // ATOMIC THRESHOLD & EXPIRY
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              {/* Quorum selector */}
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Quorum Requirement
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--bg-void)', border: '1px solid var(--border-bright)', padding: '14px 16px', borderRadius: '4px' }}>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, form.participantAddresses.length)}
                    value={form.quorum}
                    onChange={(e) => setForm((f) => ({ ...f, quorum: Number(e.target.value) }))}
                    disabled={form.participantAddresses.length === 0}
                    style={{ flex: 1, accentColor: 'var(--emerald)', cursor: 'pointer' }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--emerald)', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                    {form.quorum} of {form.participantAddresses.length || 1}
                  </span>
                </div>
              </div>

              {/* Expiry Selector */}
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Session Expiry Window
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--bg-void)', border: '1px solid var(--border-bright)', padding: '14px 16px', borderRadius: '4px' }}>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={form.expiryMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, expiryMinutes: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: 'var(--emerald)', cursor: 'pointer' }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                    {form.expiryMinutes} min
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <div style={{ marginTop: '20px', padding: '14px', background: 'rgba(244,63,94,0.1)', border: '1px solid var(--crimson)', color: 'var(--crimson)', fontFamily: 'var(--font-mono)', fontSize: '12px', borderRadius: '4px' }}>
                ⚠ {error}
              </div>
            )}

            {/* Launch CTA */}
            <button
              type="button"
              className="btn btn--emerald"
              style={{ width: '100%', padding: '18px', fontSize: '12px', marginTop: '28px', borderRadius: '4px' }}
              disabled={!canCreate || isCreating}
              onClick={handleCreate}
            >
              {isCreating ? '✦ Delegating Session PDA to MagicBlock...' : '✦ Initialize Ephemeral Chamber Session'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
