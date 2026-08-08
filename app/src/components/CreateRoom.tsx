import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Plus, Trash2, Hash, Clock, Users, Zap } from 'lucide-react';
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

  // Compute commitment hash in real-time as user types
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

  // Add creator wallet to participants automatically when connected
  useEffect(() => {
    if (publicKey && !form.participantAddresses.includes(publicKey.toBase58())) {
      // Don't auto-add — let creator choose
    }
  }, [publicKey]);

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
      // In simulator mode: create a fake session ID and go straight to room
      const sessionId =
        mode === 'simulator'
          ? `sim-${Date.now()}`
          : `real-${Date.now()}`; // placeholder until actual tx

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
    <div className="page animate-slide-up">
      <div className="container">
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* Page title */}
          <div className="mb-3">
            <h1 style={{ fontSize: '2rem' }}>
              Create a{' '}
              <span style={{ background: 'var(--grad-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Converge Room
              </span>
            </h1>
            <p className="mt-1" style={{ fontSize: '0.95rem' }}>
              Participants join a live ephemeral room to co-sign a shared commitment.
              Only the final proof settles to Solana.
            </p>
          </div>

          {/* Mode notice */}
          {mode === 'simulator' && (
            <div className="alert alert--warning mb-2">
              <Zap size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>Simulator Mode</strong> — ER state is in-memory. Switch to{' '}
                <strong>Real ER</strong> for actual MagicBlock ER execution during judging.
              </span>
            </div>
          )}

          {/* Commitment text */}
          <div className="card mb-2">
            <div className="card__header flex-center gap-1">
              <Hash size={16} style={{ color: 'var(--accent-teal)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Commitment</span>
            </div>
            <div className="card__body">
              <div className="form-group">
                <label className="label" htmlFor="commitment-text">
                  Agreement text
                </label>
                <textarea
                  id="commitment-text"
                  className="textarea"
                  placeholder="e.g. Founders Agreement v1 — we agree to the terms outlined at..."
                  rows={4}
                  value={form.commitmentText}
                  onChange={(e) => setForm((f) => ({ ...f, commitmentText: e.target.value }))}
                />
              </div>

              {commitmentHash && (
                <div className="commitment-hash mt-2">
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>SHA-256 HASH</span>
                  <br />
                  <code>{commitmentHash}</code>
                </div>
              )}

              <div className="form-group mt-2">
                <label className="label" htmlFor="context">
                  Label (optional)
                </label>
                <input
                  id="context"
                  className="input"
                  placeholder="e.g. Founders Agreement v1"
                  maxLength={128}
                  value={form.context}
                  onChange={(e) => setForm((f) => ({ ...f, context: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Participants */}
          <div className="card mb-2">
            <div className="card__header flex-between">
              <div className="flex-center gap-1">
                <Users size={16} style={{ color: 'var(--accent-purple)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Participants</span>
              </div>
              <span className="badge badge-open">
                {form.participantAddresses.length} / {MAX_PARTICIPANTS}
              </span>
            </div>
            <div className="card__body">
              {/* Address input */}
              <div className="form-group mb-2">
                <label className="label">Add wallet address</label>
                <div className="flex-center gap-1">
                  <input
                    id="participant-address-input"
                    className="input input--mono"
                    placeholder="Solana public key (base58)"
                    value={newAddress}
                    onChange={(e) => { setNewAddress(e.target.value); setAddressError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && addAddress()}
                  />
                  <button
                    id="add-participant-btn"
                    className="btn btn-ghost btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={addAddress}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {addressError && (
                  <span style={{ fontSize: '0.8rem', color: '#f87171' }}>{addressError}</span>
                )}
              </div>

              {/* Quick-add self */}
              {publicKey && !form.participantAddresses.includes(publicKey.toBase58()) && (
                <button
                  id="add-self-btn"
                  className="btn btn-ghost btn-sm mb-2"
                  onClick={addSelfAsParticipant}
                >
                  + Add my wallet
                </button>
              )}

              {/* Address list */}
              {form.participantAddresses.length > 0 && (
                <div className="flex-col gap-1">
                  {form.participantAddresses.map((addr, i) => (
                    <div key={addr} className="address-tag">
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', flexShrink: 0 }}>
                        #{i + 1}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {addr}
                      </span>
                      {publicKey?.toBase58() === addr && (
                        <span className="badge badge-present" style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                          you
                        </span>
                      )}
                      <button
                        className="address-tag__remove"
                        onClick={() => removeAddress(addr)}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quorum slider */}
              {form.participantAddresses.length > 0 && (
                <div className="form-group mt-3">
                  <label className="label">
                    Quorum — {form.quorum} of {form.participantAddresses.length} required
                  </label>
                  <input
                    id="quorum-slider"
                    type="range"
                    min={1}
                    max={form.participantAddresses.length}
                    value={form.quorum}
                    onChange={(e) => setForm((f) => ({ ...f, quorum: Number(e.target.value) }))}
                    style={{ width: '100%', accentColor: 'var(--accent-purple)', cursor: 'pointer' }}
                  />
                  <div className="flex-between" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>1 signer</span>
                    <span>{form.participantAddresses.length} / {form.participantAddresses.length}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Expiry */}
          <div className="card mb-3">
            <div className="card__header flex-center gap-1">
              <Clock size={16} style={{ color: 'var(--accent-amber)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Session Expiry</span>
            </div>
            <div className="card__body">
              <div className="form-group">
                <label className="label">
                  Duration — {form.expiryMinutes} minute{form.expiryMinutes !== 1 ? 's' : ''}
                </label>
                <input
                  id="expiry-slider"
                  type="range"
                  min={1}
                  max={60}
                  value={form.expiryMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, expiryMinutes: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: 'var(--accent-amber)', cursor: 'pointer' }}
                />
                <div className="flex-between" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>1 min</span>
                  <span>60 min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert--error mb-2">
              <span>{error}</span>
            </div>
          )}

          {/* CTA */}
          <button
            id="create-room-btn"
            className="btn btn-primary w-full"
            style={{ fontSize: '1.05rem', padding: '1rem', borderRadius: 'var(--r-lg)' }}
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
          >
            {isCreating ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                Creating Ephemeral Room...
              </>
            ) : (
              <>✦ Open Converge Room</>
            )}
          </button>

          <p className="text-center mt-2 text-muted text-sm">
            Session is delegated to MagicBlock Ephemeral Rollup immediately after creation.
          </p>
        </div>
      </div>
    </div>
  );
}
