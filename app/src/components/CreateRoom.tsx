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
    expiryMinutes: 5,
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
      setAddressError('Invalid Solana public key');
      return;
    }
    if (form.participantAddresses.includes(addr)) {
      setAddressError('Already added');
      return;
    }
    if (form.participantAddresses.length >= MAX_PARTICIPANTS) {
      setAddressError(`Maximum ${MAX_PARTICIPANTS} participants`);
      return;
    }

    setForm((f) => ({
      ...f,
      participantAddresses: [...f.participantAddresses, addr],
      quorum: Math.min(f.quorum, f.participantAddresses.length + 1),
    }));
    setNewAddress('');
  }

  function removeAddress(addr: string) {
    setForm((f) => ({
      ...f,
      participantAddresses: f.participantAddresses.filter((a) => a !== addr),
      quorum: Math.min(f.quorum, f.participantAddresses.length - 1 || 1),
    }));
  }

  function addSelfAsParticipant() {
    if (!publicKey) return;
    const addr = publicKey.toBase58();
    if (form.participantAddresses.includes(addr)) return;
    if (form.participantAddresses.length >= MAX_PARTICIPANTS) return;

    setForm((f) => ({
      ...f,
      participantAddresses: [...f.participantAddresses, addr],
    }));
  }

  async function handleCreate() {
    setError('');
    if (!form.commitmentText.trim()) {
      setError('Commitment text is required');
      return;
    }
    if (form.participantAddresses.length < 1) {
      setError('Add at least one participant');
      return;
    }
    if (form.quorum < 1 || form.quorum > form.participantAddresses.length) {
      setError('Quorum must be between 1 and participant count');
      return;
    }
    if (!commitmentHashBytes) {
      setError('Computing commitment hash...');
      return;
    }

    setIsCreating(true);
    try {
      const sessionId =
        mode === 'simulator' ? `sim-${Date.now()}` : `real-${Date.now()}`;
      onSessionCreated(sessionId, form.commitmentText, commitmentHashBytes, form);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create session');
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
    <div className="page" style={{ padding: '60px 0' }}>
      <div className="container" style={{ maxWidth: '780px' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <div className="section-label">01 // INITIALIZE CHAMBER</div>
          <h1 className="font-serif" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1.05 }}>
            Create Ephemeral Co-Signature Session.
          </h1>
          <p style={{ marginTop: '14px', color: 'var(--text-secondary)', fontSize: '16px' }}>
            Define agreement parameters, whitelist signing pubkeys, and specify quorum threshold.
          </p>
        </div>

        {/* Form Panel */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Commitment Text */}
          <div className="field">
            <label className="field__label">01 / Agreement Text & Commitment</label>
            <textarea
              className="field__textarea font-mono"
              placeholder="Enter agreement terms or commitment statement..."
              value={form.commitmentText}
              onChange={(e) => setForm((f) => ({ ...f, commitmentText: e.target.value }))}
            />
            {commitmentHash && (
              <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.5)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-mono)' }}>
                SHA-256 HASH: {commitmentHash}
              </div>
            )}
          </div>

          {/* Context Label */}
          <div className="field">
            <label className="field__label">02 / Session Label (Optional)</label>
            <input
              type="text"
              className="field__input font-mono"
              placeholder="e.g. Founders Agreement v1"
              value={form.context}
              maxLength={128}
              onChange={(e) => setForm((f) => ({ ...f, context: e.target.value }))}
            />
          </div>

          {/* Participants */}
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="field__label">03 / Whitelisted Signer Pubkeys</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                {form.participantAddresses.length} / {MAX_PARTICIPANTS}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <input
                type="text"
                className="field__input font-mono"
                placeholder="Solana Public Key (Base58)"
                value={newAddress}
                onChange={(e) => { setNewAddress(e.target.value); setAddressError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && addAddress()}
              />
              <button type="button" className="btn btn--ghost" onClick={addAddress} style={{ flexShrink: 0 }}>
                + Add Key
              </button>
            </div>

            {addressError && (
              <div style={{ color: 'var(--crimson)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginBottom: '10px' }}>
                {addressError}
              </div>
            )}

            {publicKey && !form.participantAddresses.includes(publicKey.toBase58()) && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={addSelfAsParticipant}
                style={{ fontSize: '10px', padding: '6px 12px', marginBottom: '14px' }}
              >
                + Add Connected Wallet ({publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)})
              </button>
            )}

            {/* Address List */}
            {form.participantAddresses.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {form.participantAddresses.map((addr, idx) => (
                  <div key={addr} className="signer-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                        #{idx + 1}
                      </span>
                      <span className="signer-address">{addr}</span>
                      {publicKey?.toBase58() === addr && (
                        <span className="badge-tag badge-tag--active" style={{ fontSize: '9px', padding: '2px 6px' }}>
                          You
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAddress(addr)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '14px' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quorum & Expiry Sliders */}
          {form.participantAddresses.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="field">
                <label className="field__label">Quorum Requirement</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="range"
                    min={1}
                    max={form.participantAddresses.length}
                    value={form.quorum}
                    onChange={(e) => setForm((f) => ({ ...f, quorum: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: 'var(--emerald)' }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--emerald)', fontWeight: 600 }}>
                    {form.quorum} / {form.participantAddresses.length}
                  </span>
                </div>
              </div>

              <div className="field">
                <label className="field__label">Chamber Expiry (Minutes)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={form.expiryMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, expiryMinutes: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: 'var(--emerald)' }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {form.expiryMinutes}m
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '12px', background: 'rgba(244,63,94,0.1)', border: '1px solid var(--crimson)', color: 'var(--crimson)', fontFamily: 'var(--font-mono)', fontSize: '12px', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            className="btn btn--emerald"
            style={{ width: '100%', padding: '16px', fontSize: '12px', marginTop: '10px' }}
            disabled={!canCreate || isCreating}
            onClick={handleCreate}
          >
            {isCreating ? 'Delegating PDA to MagicBlock...' : '✦ Initialize Ephemeral Chamber'}
          </button>
        </div>
      </div>
    </div>
  );
}
