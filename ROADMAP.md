# Converge — Technical Roadmap

Converge was built for the **MagicBlock Blitz Hackathon** to demonstrate the UX and architectural viability of Ephemeral Coordination Rooms. 

While the core user journey, cryptographic hashing, frontend architecture, and Solana program deployment are complete, upstream ecosystem dependencies required us to isolate the Ephemeral Rollup (ER) state machine into a deterministic simulator for the live demo.

This roadmap outlines the immediate technical path to resolving these workarounds and bringing Converge to production.

---

## Phase 1: Dependency Resolution & Anchor Build

**Target:** Post-Hackathon / Next 30 Days

Currently, a known ecosystem conflict on `crates.io` (`solana-loader-v3-interface v3.0.0` breaking `anchor-lang 0.32.1`) prevents local compilation of the `ephemeral-rollups-sdk`. 

**Action Items:**
- [ ] Monitor the `solana-program` and `anchor-lang` upstream repositories for the v1.18 dependency resolution.
- [ ] Upgrade the Converge workspace to the patched Anchor CLI version.
- [ ] Re-compile `anchor/programs/converge/src/lib.rs` (which already contains the complete `#[delegate]` and `#[commit]` ER macros).
- [ ] Verify successful local test execution against the Solana localnet.

---

## Phase 2: Live MagicBlock ER Integration

**Target:** Q4 2024

With the program compiling successfully, the focus shifts to wiring the frontend application directly to the MagicBlock devnet router, deprecating the Simulator Mode.

**Action Items:**
- [ ] **Frontend RPC Migration:** Replace the `simulator.ts` endpoints with standard Solana `@solana/web3.js` calls routed through the MagicBlock `devnet-router.magicblock.app`.
- [ ] **Onchain Delegation:** Expose the `delegate_session` instruction in the UI, allowing room creators to officially delegate their session PDA to the ER upon initialization.
- [ ] **Live Telemetry:** Connect the frontend to the ER RPC to read live account state changes (presence, heartbeats) rather than simulating them locally.
- [ ] **Atomic Settlement:** Ensure the `commit_session` instruction correctly unwinds the ER state and flushes the `ConvergeCommitRecord` to the Solana base layer.

---

## Phase 3: Security & Edge Case Handling

**Target:** Pre-Mainnet

Before mainnet deployment, the ephemeral coordination state machine must handle complex edge cases robustly.

**Action Items:**
- [ ] **Zombie Sessions:** Implement an onchain permissionless crank to forcefully `expire_session` on abandoned rooms to recover rent.
- [ ] **Malicious Signatures:** Add cryptographic verification on the ER side to ensure that only whitelisted participants can increment the `signed_count`.
- [ ] **Session Re-entry:** Define the behavior for participants who drop connection (miss heartbeats) and attempt to rejoin a live session.
- [ ] **Audit:** Request a formal audit of the `ConvergeCommitRecord` proof generation to guarantee settlement integrity.

---

## Phase 4: Composability & Extensions

**Target:** Mainnet & Beyond

Converge is designed as a foundational primitive. Once stable on mainnet, we will expand its composability.

**Action Items:**
- [ ] **Program CPI SDK:** Release a Rust crate making it easy for other Solana programs to verify a `ConvergeCommitRecord` as a precondition for their own instructions.
- [ ] **Smart Accounts / Multisig Integration:** Allow Squads or realms to require a Converge ephemeral session before executing a proposal.
- [ ] **Variable Workflows:** Expand the room types beyond binary "co-signing" to support Auctions (highest bid wins), Attendance (POAPs), and Agent Swarm coordination.
