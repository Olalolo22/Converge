Converge

Ephemeral Coordination Rooms on Solana

“The room was ephemeral. The proof is permanent.”

Converge is an ephemeral coordination layer for Solana.

It turns multi-party workflows into temporary live rooms: participants join, coordinate, and act on shared state in real time, while only the meaningful final outcome becomes durable on Solana.

For the MagicBlock Blitz Hackathon, Converge demonstrates this primitive through synchronous co-signing: multiple wallets enter the same session, sign a shared commitment, reach quorum, and produce a canonical onchain proof.

Built with Solana and MagicBlock Ephemeral Rollups.

*Program (Devnet):** `DYRQJTnz2ehCexSjqiKFVt5jfJSNXN1e915AMboHHQz5`
**Explorer:** https://explorer.solana.com/address/DYRQJTnz2ehCexSjqiKFVt5jfJSNXN1e915AMboHHQz5?cluster=devnet

---
A caveat: The demo submitted  is currently running against our simulator. We hit an upstream solana-loader-v3-interface dependency breakage that blocked the Ephemeral Rollups SDK build in our environment right before submission. So we separated the demo state machine from the integration layer rather than ship a broken demo. The repository contains the full Anchor integration with the ER delegation and commit macros, and the simulator reproduces the exact ephemeral state flow we’re targeting

⸻

The Idea

Most onchain coordination is asynchronous.

A participant acts. Another participant responds. Another signs. Intermediate state accumulates on the base layer even though much of that state only matters for the few minutes during which the coordination is happening.

Converge treats that coordination as a temporary execution session.

             CREATE
                │
                ▼
       ┌─────────────────┐
       │  LIVE ROOM      │
       │                 │
       │  Join           │
       │  Presence       │
       │  Heartbeats     │
       │  Actions        │
       │  Quorum         │
       └────────┬────────┘
                │
          session ends
                │
                ▼
       ┌─────────────────┐
       │ FINAL OUTCOME   │
       │                 │
       │ Commitment      │
       │ Signers         │
       │ Quorum          │
       │ Timestamp       │
       └────────┬────────┘
                │
                ▼
             SOLANA

The live coordination is temporary.

The result is permanent.

⸻

The MagicBlock Story

Converge is built around the execution model enabled by MagicBlock Ephemeral Rollups.

The live room contains state that can change frequently:

┌─────────────────────────────────────────────────────┐
│          MAGICBLOCK EPHEMERAL ROLLUP                │
│                                                     │
│  Participant presence                               │
│  Heartbeats / keep-alive                            │
│  Signing progress                                   │
│  Quorum detection                                   │
│  Session lifecycle                                  │
│                                                     │
│             Temporary coordination                  │
│                       │                             │
│                       ▼                             │
│                FINAL OUTCOME                        │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ settlement
                        ▼
┌─────────────────────────────────────────────────────┐
│                   SOLANA                            │
│                                                     │
│  Session configuration                              │
│  Final co-signature proof                           │
│  Commitment hash                                    │
│  Signed wallets                                     │
│  Quorum                                             │
│  Settlement timestamp                               │
└─────────────────────────────────────────────────────┘

The architectural principle is:

High-frequency coordination is ephemeral. Only the meaningful outcome needs to become durable.

This gives Converge a clean separation between live coordination state and permanent settlement state.

⸻

Why an Ephemeral Rollup?

A conventional Solana workflow can record every interaction directly onchain.

But a live coordination room does not necessarily need every intermediate state to become permanent.

Consider a session with:

* 3 participants
* repeated heartbeats
* joins and leaves
* multiple state transitions
* signing progress
* quorum detection
* a final settlement

Most of that activity is useful while the room is alive.

Once the session reaches a terminal state, what matters is the result.

Converge therefore separates the two:

LIVE SESSION
    │
    ├── presence
    ├── heartbeats
    ├── signing
    ├── quorum
    └── lifecycle
          │
          ▼
      SETTLEMENT
          │
          ▼
SOLANA BASE LAYER
    │
    └── canonical proof

⸻

Demo Flow

The Blitz demonstration uses co-signing as the first application of the coordination-room primitive.

CREATE ROOM
     ↓
Define commitment
Define participants
Define quorum
Define expiry
     ↓
OPEN CONVERGE ROOM
     ↓
Participants join
     ↓
LIVE PRESENCE
     ↓
Participants sign
     ↓
QUORUM REACHED
     ↓
FINAL SETTLEMENT
     ↓
CO-SIGNATURE PROOF
     ↓
SOLANA

The user sees

1. A commitment to sign
2. The participants required
3. A live countdown
4. Participant presence
5. Signing progress
6. Quorum progress
7. Final settlement
8. The resulting proof

The point is not simply that wallets can sign.

The point is that the signing process itself is treated as a temporary coordination session.

⸻

Architecture

Solana Program

The onchain program is implemented with Anchor.

The main lifecycle is:

Instruction	Execution	Purpose
create_session	Solana base	Initialize the ConvergeSession
delegate_session	Solana base	Delegate the session account to the ER
join_session	ER	Track participant presence
heartbeat	ER	Refresh participant presence
sign_session	ER	Record a participant’s signature state
commit_session	ER → Solana	Settle the final state
expire_session	Solana base	Mark an expired session

The exact execution path depends on the MagicBlock environment and delegation state.

⸻

Live Session State

The ephemeral session is responsible for coordination state such as:

Participant
    ├── present
    ├── signed
    └── last heartbeat
Session
    ├── commitment
    ├── quorum
    ├── expiry
    ├── participants
    └── lifecycle status

This state exists to coordinate the room while it is active.

⸻

Onchain Accounts

ConvergeSession

The session account contains the configuration required to establish the coordination room.

Conceptually:

ConvergeSession {
    creator,
    participant_pubkeys,
    commitment_hash,
    quorum,
    expiry_ts,
    status,
    ...
}

It defines:

* who is allowed to participate
* what commitment is being coordinated
* how many signatures are required
* when the session expires
* the current terminal state

⸻

ConvergeCommitRecord

When the session successfully reaches quorum, the meaningful result becomes a durable proof.

The record contains information such as:

ConvergeCommitRecord {
    session,
    commitment_hash,
    signed_pubkeys,
    quorum,
    committed_at,
    er_session_hash,
}

This gives other clients and programs a compact representation of the final outcome without requiring them to replay the entire live coordination session.

⸻

Key Invariant

The architectural goal is simple:

Intermediate coordination should not need to become permanent blockchain history.

Joining, heartbeating, and signing are session-level actions.

The final commitment is the durable outcome.

Conceptually:

JOIN
  │
  ├── temporary
  │
HEARTBEAT
  │
  ├── temporary
  │
SIGN
  │
  ├── temporary
  │
QUORUM
  │
  └── settlement
          │
          ▼
       SOLANA

⸻

Settlement

When the required quorum is reached, the session can transition into its final settlement path.

The final result contains:

* session identifier
* commitment hash
* wallets that signed
* required quorum
* settlement timestamp
* ER session state hash where applicable

The result is represented by ConvergeCommitRecord.

The live room can then disappear without losing the fact that the final agreement occurred.

The room was ephemeral. The proof is permanent.

⸻

Expiry

A coordination room does not have to succeed.

Every session has an expiry.

If quorum is not reached before the deadline:

SESSION
   │
   ├── quorum reached
   │       ↓
   │    COMMITTED
   │
   └── deadline reached
           ↓
        EXPIRED

An expired session does not produce a valid ConvergeCommitRecord.

This gives the room a clear atomic lifecycle:

             ┌──────────────┐
             │     OPEN     │
             └──────┬───────┘
                    / \
                   /   \
          quorum  /     \ expiry
                 /       \
                ▼         ▼
        ┌────────────┐  ┌──────────┐
        │ COMMITTED  │  │ EXPIRED │
        └────────────┘  └──────────┘

⸻

Composability

Converge is designed as a reusable coordination primitive rather than only a standalone signing application.

Once a session produces a final proof, another Solana program can use that proof as a precondition for its own logic.

Conceptually:

let record =
    ConvergeCommitRecord::from_account(&commit_record_info)?;
require!(
    record.commitment_hash == expected_hash,
    YourError::WrongCommitment
);
require!(
    record.signed_pubkeys.contains(&required_signer),
    YourError::MissingSignature
);

This creates a simple pattern:

APPLICATION
     │
     ▼
CONVERGE ROOM
     │
     ├── coordinate
     ├── verify
     └── reach outcome
           │
           ▼
    COMMIT RECORD
           │
           ▼
APPLICATION CONTINUES

Potential applications include:

* Governance approvals
* Auction finalization
* Multi-party transaction authorization
* Agent coordination
* Attendance verification
* Collaborative workflows
* Other synchronous Solana workflows

Co-signing is simply the first concrete demonstration.

⸻

Frontend

The frontend is built with:

* React
* Vite
* Solana Wallet Adapter
* Vanilla CSS

The application has two conceptual connections:

Frontend
   │
   ├──────────────► Solana Base Layer
   │
   └──────────────► MagicBlock ER Router

The UI is designed around the idea of a live room, rather than a conventional blockchain transaction form.

⸻

User Flow

1. Create a Room

The creator:

1. Connects a wallet
2. Enters the commitment text
3. Adds participant wallet addresses
4. Selects the quorum
5. Sets an expiry
6. Opens the Converge room

The commitment is hashed before being used as the canonical session commitment.

⸻

2. Join

Participants connect their wallets and join the room.

The room identifies whether each required participant is currently present.

PARTICIPANTS
● 0xAB...91   PRESENT
○ 0x7C...42   WAITING
○ 0xD4...88   WAITING

⸻

3. Stay Present

Participants maintain an active session through heartbeat updates.

This lets the room distinguish between:

PRESENT

and

NO LONGER PRESENT

without requiring every heartbeat to become permanent application history.

⸻

4. Sign

A participant can sign the commitment while present in the room.

The room updates its signing state:

SIGNING PROGRESS
████████░░░░░░░░
2 / 3 SIGNED

⸻

5. Reach Quorum

Once the required number of participants has signed:

QUORUM REACHED
3 / 3 SIGNED

The session enters its settlement path.

⸻

6. Proof

The final proof displays:

* Commitment hash
* Signers
* Quorum
* Settlement timestamp
* Session information
* Solana transaction/proof information where available

The user no longer needs the entire live session to verify the result.

⸻

Simulator Mode

Converge also includes a deterministic simulator for local development, offline demonstrations, and environments where the live dependency stack is unavailable.

The simulator mirrors the coordination state machine:

OPEN
 ↓
JOIN
 ↓
PRESENCE
 ↓
SIGN
 ↓
QUORUM
 ↓
COMMIT

It does not require a network connection and is useful for validating the product flow independently from infrastructure availability.

The simulator should be understood as a demo and development resilience layer, not as the underlying architectural model.

The intended production execution model remains:

Solana
   ↓
Delegation
   ↓
MagicBlock Ephemeral Rollup
   ↓
Live coordination
   ↓
Settlement
   ↓
Solana

⸻

Demo Environment

The repository contains the MagicBlock ER integration alongside the deterministic simulator.

The simulator exists because blockchain infrastructure and dependency stacks can fail independently of application logic. Keeping the coordination state machine separable allows the complete user experience to remain demonstrable while the ER integration is developed and tested.

For the hackathon, the important architectural boundary remains:

EPHEMERAL
Presence
Heartbeats
Intermediate actions
Signing state
Quorum computation
             ↓
PERMANENT
Final commitment
Signed participants
Settlement timestamp
Proof

⸻

Why Converge?

Converge is not trying to make signatures themselves novel.

The interesting primitive is the temporary coordination environment around them.

Traditional multisig-style workflows are generally concerned with whether required parties have approved something.

Converge focuses on how those parties coordinate while the decision is happening:

Traditional workflow
Person A signs
      ↓
wait
      ↓
Person B signs
      ↓
wait
      ↓
Person C signs
      ↓
final state
Converge
      ┌──────────────────────────┐
      │     LIVE ROOM            │
      │                          │
      │ A ──────┐               │
      │ B ──────┼── coordinate  │
      │ C ──────┘               │
      │                          │
      │ presence + actions      │
      │ quorum + lifecycle      │
      └────────────┬─────────────┘
                   │
                   ▼
              FINAL PROOF

The room gives the workflow a temporary shared execution context.

⸻

What Converge Demonstrates

Converge demonstrates a broader pattern for Solana applications:

1. Create a temporary session

Define participants, rules, and an intended outcome.

2. Move live coordination into the session

Participants interact with shared state while the session is active.

3. Keep intermediate state ephemeral

Not every heartbeat or interaction needs to become permanent history.

4. Detect a meaningful terminal outcome

The session reaches quorum or expires.

5. Settle only what matters

The final result becomes a durable Solana record.

In one sentence:

Converge turns Ephemeral Rollups into live coordination rooms for Solana.

⸻

Tech Stack

Layer	Technology
Blockchain	Solana Devnet
Ephemeral execution	MagicBlock Ephemeral Rollups
Smart Contract	Anchor 0.32
ER SDK	ephemeral-rollups-sdk
Frontend	React 18 + Vite
Wallet	@solana/wallet-adapter
Styling	Vanilla CSS
Language	Rust + TypeScript

⸻

Project Structure

converge/
│
├── anchor/
│   ├── programs/
│   │   └── converge/
│   │       └── src/
│   │           └── lib.rs
│   │
│   ├── Anchor.toml
│   └── Cargo.toml
│
└── app/
    ├── src/
    │   ├── components/
    │   ├── services/
    │   ├── hooks/
    │   └── ...
    │
    ├── package.json
    └── vite.config.ts

⸻

Quick Start

Prerequisites

* Node.js ≥ 18
* Anchor CLI ≥ 0.32
* Solana CLI
* A Solana wallet such as Phantom, Solflare, or Backpack

⸻

1. Build the Anchor Program

cd anchor
anchor build

Deploy to Solana Devnet:

anchor deploy --provider.cluster devnet

Update the resulting program ID in the relevant configuration files.

⸻

2. Run the Frontend

cd app
npm install
npm run dev

Open the local Vite URL displayed by the development server.

⸻

Usage

Create a Room

1. Connect your wallet
2. Enter the commitment
3. Add participant wallets
4. Select the quorum
5. Set an expiry
6. Open the Converge room

⸻

Coordinate

Participants enter the room and become visible as present.

The live interface tracks:

* Presence
* Heartbeats
* Signing state
* Quorum
* Remaining session time

⸻

Sign

Each participant signs the shared commitment while participating in the session.

Signing progress updates in the live room.

⸻

Settle

Once quorum is reached, the session enters the final settlement path.

The resulting proof records the meaningful outcome of the coordination session.

⸻

Current Demonstration

The Blitz demonstration focuses on one simple workflow:

CREATE
   ↓
JOIN
   ↓
PRESENCE
   ↓
SIGN
   ↓
QUORUM
   ↓
SETTLE
   ↓
PROOF

The deliberately narrow scope allows the demonstration to focus on the central idea:

A temporary multi-party coordination session can produce a compact permanent result.

⸻

Future Applications

The same coordination-room primitive could be extended beyond co-signing.

Governance

A council enters a temporary proposal room and reaches a required quorum before a governance action can execute.

Auctions

Bidders interact in a live auction session where high-frequency bidding state remains ephemeral and the winning outcome settles onchain.

Agent Coordination

Multiple autonomous agents coordinate inside a bounded execution session before committing a final decision.

Attendance

Participants remain present during an event or session and receive a final verifiable participation result.

Multi-Party Transactions

Multiple parties coordinate around a shared transaction intent and produce a final authorization record.

The common pattern is always the same:

TEMPORARY COORDINATION
          ↓
      FINAL OUTCOME
          ↓
    PERMANENT STATE

⸻

The Vision

Solana is excellent at making important state permanent.

Not every interaction is important enough to become permanent.

Converge explores the layer in between:

temporary execution for coordination, permanent settlement for outcomes.

A room can exist for seconds or minutes.

Participants can interact continuously.

The session can disappear.

What matters survives.

⸻

Converge

Ephemeral coordination. Permanent outcomes.

The room was ephemeral. The proof is permanent.

Built for the MagicBlock Blitz Hackathon.

MIT License
