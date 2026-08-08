# Converge

## Ephemeral Coordination Rooms on Solana

> **"The room was ephemeral. The proof is permanent."**

Converge is an **ephemeral coordination layer for Solana**. It turns multi-party workflows into temporary live rooms: participants join, coordinate, and act on shared state in real time, while only the meaningful final outcome becomes durable on Solana.

For the **MagicBlock Blitz Hackathon**, Converge demonstrates this primitive through **synchronous co-signing**: multiple wallets enter the same session, sign a shared commitment, reach quorum, and produce a canonical onchain proof.

Built with **Solana** and **MagicBlock Ephemeral Rollups**.

**Program (Devnet):** `DYRQJTnz2ehCexSjqiKFVt5jfJSNXN1e915AMboHHQz5`
**Explorer:** https://explorer.solana.com/address/DYRQJTnz2ehCexSjqiKFVt5jfJSNXN1e915AMboHHQz5?cluster=devnet

---

## The MagicBlock Story

Converge is a concrete demonstration of what Ephemeral Rollups enable:

```
┌─────────────────────────────────────────────────────┐
│          MagicBlock Ephemeral Rollup (ER)           │
│                                                     │
│  → Participant presence    (sub-10ms, no L1 write)  │
│  → Heartbeat / keep-alive  (sub-10ms, no L1 write)  │
│  → Signing progress        (sub-10ms, no L1 write)  │
│  → Quorum detection        (pure ER computation)    │
│  → Session lifecycle                                │
│                                                     │
│  Only when quorum is reached:                       │
│         ↓ commit_session                            │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Solana Base Layer                   │
│                                                     │
│  CoSignSession   — session configuration & status   │
│  ConvergeCommitRecord — immutable co-signature proof │
│                                                     │
│  commitment_hash, signed wallets, quorum, timestamp │
└─────────────────────────────────────────────────────┘
```

**High-frequency coordination is ephemeral. Only the meaningful final agreement settles onchain.**

This is the primary reason Converge exists — and why it could not be built the same way without Ephemeral Rollups.

---

## Demo Flow

```
CREATE ROOM
   ↓
Solana: init CoSignSession PDA
Solana: delegate PDA to MagicBlock ER
   ↓
WALLETS JOIN (ER-only — no Solana tx)
   ↓
LIVE PRESENCE visible in real-time
   ↓
PARTICIPANTS SIGN (ER-only — no Solana tx)
   ↓
QUORUM REACHED → ER commits to Solana
   ↓
Solana: ConvergeCommitRecord written
   ↓
✓ CO-SIGNATURE COMMITTED — Proof on Solana
```

---

## Architecture

### Anchor Program (`anchor/programs/converge/`)

| Instruction | Sent To | Purpose |
|---|---|---|
| `create_session` | Solana base | Init `ConvergeSession` PDA |
| `delegate_session` | Solana base | Hand PDA to MagicBlock ER |
| `join_session` | **ER RPC** | Track participant presence |
| `heartbeat` | **ER RPC** | Refresh last-seen timestamp |
| `sign_session` | **ER RPC** | Mark participant as signed |
| `commit_session` | **ER RPC** | Flush final state → Solana, write `ConvergeCommitRecord` |
| `expire_session` | Solana base | Mark session Expired post-deadline |

### Key invariant

> Joining, heartbeating, and signing never produce a Solana transaction. The Solana account is read-only (owned by the delegation program) for the entire live session. Only the final `commit_session` via `MagicIntentBundleBuilder` writes to the base layer.

### Onchain accounts

**`ConvergeSession`** — session config (creator, participants, commitment hash, quorum, expiry, status)

**`ConvergeCommitRecord`** — immutable proof (signed wallets, quorum, committed timestamp, ER session hash)

### Frontend (`app/`)

- **React + Vite** — fast dev, single-page app
- **Dual connection** — base layer (`api.devnet.solana.com`) + ER router (`devnet-router.magicblock.app`)
- **Simulator mode** — exact ER state machine for offline demos (fallback only; Real ER is the primary judging path)

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- A Phantom / Solflare / Backpack wallet

### 1. Anchor Program

The program is deployed to Solana Devnet at:

```
DYRQJTnz2ehCexSjqiKFVt5jfJSNXN1e915AMboHHQz5
```

The full MagicBlock ER integration (`ephemeral-rollups-sdk`, `#[delegate]`, `#[commit]`) is implemented in `anchor/programs/converge/src/lib.rs`.

> **Note on local builds:** `anchor build` currently hits a known dependency conflict on crates.io between `anchor-lang 0.32.1` and the recently published `solana-loader-v3-interface v3.0.0`. This is an upstream ecosystem issue affecting any machine resolving fresh dependencies from the registry. The program was deployed to devnet via Solana Playground. The ER SDK integration remains in the repository source.

### 2. Run the Frontend

```bash
cd app
npm install
npm run dev
```

Open the local Vite URL displayed by the development server.

---

## Usage

### Create a Room

1. Connect your wallet
2. Enter the commitment text (will be SHA-256 hashed)
3. Add participant wallet addresses (max 5)
4. Set quorum and expiry duration
5. Click **Open Converge Room**

### Live Room

- Participants join using their wallet
- Each participant's `PRESENT` status appears in real-time (ER state)
- Participants click **Sign Commitment** — no Solana tx per sign
- Counter updates live: `1/3 → 2/3 → 3/3 SIGNED`

### Settlement

- When quorum is reached, `commit_session` is sent via MagicBlock SDK
- ER flushes state to Solana base layer
- `ConvergeCommitRecord` PDA is created with the immutable proof
- UI shows commitment hash, signers, and Solana Explorer link

### Expiry

- If session expires before quorum: status transitions to `EXPIRED`
- No `ConvergeCommitRecord` is written
- No valid co-signature proof exists

---

## Simulator Mode

For offline demos and single-operator testing, switch to **Simulator Mode** in the header. This runs an exact in-memory mirror of the ER state machine — same logic, same state transitions, no network required.

> **Note:** Real ER mode (primary judging path) uses actual MagicBlock endpoints. The simulator is a fallback only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Solana Devnet |
| Ephemeral Rollups | MagicBlock ER (`devnet-router.magicblock.app`) |
| Smart Contract | Anchor 0.32 + `ephemeral-rollups-sdk` |
| Frontend | React 18 + Vite |
| Wallet | `@solana/wallet-adapter` |
| Styling | Vanilla CSS (dark glassmorphic) |

---

## Composability

Other Solana programs can use `ConvergeCommitRecord` as a precondition for their own logic:

```rust
// In another program:
let record = ConvergeCommitRecord::from_account(&commit_record_info)?;

// Verify co-signature proof
require!(record.commitment_hash == expected_hash, YourError::WrongCommitment);
require!(record.signed_pubkeys.contains(&required_signer), YourError::MissingSignature);
require!(record.committed_at > some_timestamp, YourError::StaleProof);
```

This makes Converge a reusable ephemeral coordination primitive for:
- Governance approvals
- Auction finalization
- Agent coordination
- Multi-party transaction authorization
- Attendance verification

---

## License

MIT
