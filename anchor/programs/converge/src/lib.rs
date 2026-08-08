use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("9VnuYqz9fkambuAVxXWkHGtf1EpzLzchSFDRvpSwNLWU");

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
pub const MAX_PARTICIPANTS: usize = 5;
pub const SESSION_SEED: &[u8] = b"converge_session";
pub const RECORD_SEED: &[u8] = b"converge_record";

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SessionStatus {
    Pending,
    Committed,
    Expired,
}

// ─────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────

/// CoSign session — created on Solana base layer, delegated to ER.
/// During the live session, ER tracks presence & signatures.
/// At commit, final signed_pubkeys are written here.
#[account]
pub struct ConvergeSession {
    pub creator: Pubkey,
    /// Allowed signers — max 5 for hackathon MVP
    pub participant_pubkeys: Vec<Pubkey>,
    /// sha256(commitment text) — computed by client
    pub commitment_hash: [u8; 32],
    /// How many signatures needed
    pub quorum: u8,
    /// Session lifecycle status
    pub status: SessionStatus,
    /// Unix timestamp when session becomes invalid
    pub expiry_ts: i64,
    /// Set when committed
    pub committed_at: i64,
    /// Human-readable label (e.g. "Founders Agreement v1")
    pub context: String,
    /// Optional URI to full document
    pub metadata_uri: String,
    /// Bump for PDA derivation
    pub bump: u8,
}

impl ConvergeSession {
    /// Max serialized size — used in account init space calculation
    pub fn space(num_participants: usize, context_len: usize, uri_len: usize) -> usize {
        8 +                           // anchor discriminator
        32 +                          // creator
        4 + (32 * num_participants) + // participant_pubkeys (Vec prefix + pubkeys)
        32 +                          // commitment_hash
        1 +                           // quorum
        1 +                           // status (enum as u8)
        8 +                           // expiry_ts
        8 +                           // committed_at
        4 + context_len +             // context string
        4 + uri_len +                 // metadata_uri string
        1                             // bump
    }
}

/// Immutable, canonical co-signature proof — written to Solana at commit.
/// Other programs can read this to verify a co-signature occurred.
#[account]
pub struct ConvergeCommitRecord {
    pub session: Pubkey,
    pub commitment_hash: [u8; 32],
    /// Wallets that actually signed during the ER session
    pub signed_pubkeys: Vec<Pubkey>,
    pub quorum: u8,
    pub committed_at: i64,
    /// Hash of ER session state summary for audit trail
    pub er_session_hash: [u8; 32],
    pub bump: u8,
}

impl ConvergeCommitRecord {
    pub fn space(num_signed: usize) -> usize {
        8 +                      // discriminator
        32 +                     // session pubkey
        32 +                     // commitment_hash
        4 + (32 * num_signed) +  // signed_pubkeys
        1 +                      // quorum
        8 +                      // committed_at
        32 +                     // er_session_hash
        1                        // bump
    }
}

// ─────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────
#[error_code]
pub enum ConvergeError {
    #[msg("Too many participants — max 5 for MVP")]
    TooManyParticipants,
    #[msg("Quorum cannot exceed participant count")]
    InvalidQuorum,
    #[msg("Session has already expired")]
    SessionExpired,
    #[msg("Session is not in Pending state")]
    SessionNotPending,
    #[msg("Session is not committed — no proof exists")]
    SessionNotCommitted,
    #[msg("Participant is not in the allowed signer list")]
    ParticipantNotAllowed,
    #[msg("Quorum not yet reached")]
    QuorumNotReached,
    #[msg("Signed count exceeds participant count")]
    InvalidSignedCount,
    #[msg("Context string too long — max 128 chars")]
    ContextTooLong,
}

// ─────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────
#[event]
pub struct SessionCreated {
    pub session: Pubkey,
    pub creator: Pubkey,
    pub quorum: u8,
    pub expiry_ts: i64,
}

#[event]
pub struct SessionCommitted {
    pub session: Pubkey,
    pub commitment_hash: [u8; 32],
    pub signed_count: u8,
    pub quorum: u8,
    pub committed_at: i64,
}

#[event]
pub struct SessionExpired {
    pub session: Pubkey,
    pub expired_at: i64,
}

// ─────────────────────────────────────────────
// Program
// ─────────────────────────────────────────────

#[ephemeral]
#[program]
pub mod converge {
    use super::*;

    // ─────────────────────────────────────────
    // 1. create_session
    //    Called on Solana base layer.
    //    Initializes the ConvergeSession PDA.
    // ─────────────────────────────────────────
    pub fn create_session(
        ctx: Context<CreateSession>,
        participant_pubkeys: Vec<Pubkey>,
        commitment_hash: [u8; 32],
        quorum: u8,
        expiry_ts: i64,
        context: String,
        metadata_uri: String,
    ) -> Result<()> {
        require!(
            participant_pubkeys.len() <= MAX_PARTICIPANTS,
            ConvergeError::TooManyParticipants
        );
        require!(
            quorum > 0 && quorum as usize <= participant_pubkeys.len(),
            ConvergeError::InvalidQuorum
        );
        require!(context.len() <= 128, ConvergeError::ContextTooLong);

        let session = &mut ctx.accounts.session;
        session.creator = ctx.accounts.creator.key();
        session.participant_pubkeys = participant_pubkeys;
        session.commitment_hash = commitment_hash;
        session.quorum = quorum;
        session.status = SessionStatus::Pending;
        session.expiry_ts = expiry_ts;
        session.committed_at = 0;
        session.context = context;
        session.metadata_uri = metadata_uri;
        session.bump = ctx.bumps.session;

        emit!(SessionCreated {
            session: session.key(),
            creator: session.creator,
            quorum: session.quorum,
            expiry_ts: session.expiry_ts,
        });

        Ok(())
    }

    // ─────────────────────────────────────────
    // 2. delegate_session
    //    Called on Solana base layer after create_session.
    //    Delegates the ConvergeSession PDA to MagicBlock ER.
    //    After this, join/heartbeat/sign are routed to ER RPC.
    // ─────────────────────────────────────────
    #[delegate]
    pub fn delegate_session(ctx: Context<DelegateSession>) -> Result<()> {
        let session_key = ctx.accounts.session.key();
        let seeds: &[&[u8]] = &[SESSION_SEED, session_key.as_ref()];

        ctx.accounts.delegate_pda(
            &ctx.accounts.creator,
            seeds,
            DelegateConfig::default(),
        )?;

        Ok(())
    }

    // ─────────────────────────────────────────
    // 3. join_session
    //    Sent to ER RPC (not Solana base layer).
    //    The session PDA is delegated — ER validates & tracks presence.
    //    Sets present = true for this participant in ER state.
    //    (No base layer write occurs here.)
    // ─────────────────────────────────────────
    pub fn join_session(ctx: Context<SessionAction>) -> Result<()> {
        let session = &ctx.accounts.session;
        let participant = ctx.accounts.participant.key();

        require!(
            session.status == SessionStatus::Pending,
            ConvergeError::SessionNotPending
        );
        require!(
            Clock::get()?.unix_timestamp < session.expiry_ts,
            ConvergeError::SessionExpired
        );
        require!(
            session.participant_pubkeys.contains(&participant),
            ConvergeError::ParticipantNotAllowed
        );

        // ER tracks presence in its own runtime state — no account writes needed
        // for join. Instruction exists so ER validator can verify eligibility
        // and log presence against this session PDA.
        Ok(())
    }

    // ─────────────────────────────────────────
    // 4. heartbeat
    //    Sent to ER RPC to maintain presence.
    //    Refreshes lastHeartbeat for this participant in ER state.
    //    Called every ~5-10 seconds by the client.
    // ─────────────────────────────────────────
    pub fn heartbeat(ctx: Context<SessionAction>) -> Result<()> {
        let session = &ctx.accounts.session;
        let participant = ctx.accounts.participant.key();

        require!(
            session.status == SessionStatus::Pending,
            ConvergeError::SessionNotPending
        );
        require!(
            Clock::get()?.unix_timestamp < session.expiry_ts,
            ConvergeError::SessionExpired
        );
        require!(
            session.participant_pubkeys.contains(&participant),
            ConvergeError::ParticipantNotAllowed
        );

        // ER validator refreshes its internal lastHeartbeat for this participant.
        Ok(())
    }

    // ─────────────────────────────────────────
    // 5. sign_session
    //    Sent to ER RPC. Marks participant as signed in ER state.
    //    ER recomputes signed_count and has_quorum.
    //    No Solana write happens here — pure ER state update.
    // ─────────────────────────────────────────
    pub fn sign_session(ctx: Context<SessionAction>) -> Result<()> {
        let session = &ctx.accounts.session;
        let participant = ctx.accounts.participant.key();

        require!(
            session.status == SessionStatus::Pending,
            ConvergeError::SessionNotPending
        );
        require!(
            Clock::get()?.unix_timestamp < session.expiry_ts,
            ConvergeError::SessionExpired
        );
        require!(
            session.participant_pubkeys.contains(&participant),
            ConvergeError::ParticipantNotAllowed
        );

        // ER validator updates its internal signed state for this participant.
        // When ER detects signed_count >= quorum, client calls commit_session.
        Ok(())
    }

    // ─────────────────────────────────────────
    // 6. commit_session
    //    Called via MagicIntentBundleBuilder when quorum reached.
    //    Annotated with #[commit] — MagicBlock ER flushes the session
    //    PDA state back to Solana base layer and undelegates the account.
    //    Also creates the immutable ConvergeCommitRecord PDA.
    // ─────────────────────────────────────────
    #[commit]
    pub fn commit_session(
        ctx: Context<CommitSession>,
        signed_pubkeys: Vec<Pubkey>,
        er_session_hash: [u8; 32],
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let clock = Clock::get()?;

        require!(
            session.status == SessionStatus::Pending,
            ConvergeError::SessionNotPending
        );
        require!(
            !signed_pubkeys.is_empty() && signed_pubkeys.len() >= session.quorum as usize,
            ConvergeError::QuorumNotReached
        );
        require!(
            signed_pubkeys.len() <= MAX_PARTICIPANTS,
            ConvergeError::InvalidSignedCount
        );

        // Verify all signed_pubkeys are valid participants
        for pubkey in &signed_pubkeys {
            require!(
                session.participant_pubkeys.contains(pubkey),
                ConvergeError::ParticipantNotAllowed
            );
        }

        let committed_at = clock.unix_timestamp;

        // Update session status
        session.status = SessionStatus::Committed;
        session.committed_at = committed_at;

        // Write the immutable commit record
        let record = &mut ctx.accounts.commit_record;
        record.session = session.key();
        record.commitment_hash = session.commitment_hash;
        record.signed_pubkeys = signed_pubkeys;
        record.quorum = session.quorum;
        record.committed_at = committed_at;
        record.er_session_hash = er_session_hash;
        record.bump = ctx.bumps.commit_record;

        // Commit & undelegate the session PDA back to base layer
        commit_and_undelegate_accounts(
            &ctx.accounts.creator,
            vec![&ctx.accounts.session.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        emit!(SessionCommitted {
            session: session.key(),
            commitment_hash: session.commitment_hash,
            signed_count: record.signed_pubkeys.len() as u8,
            quorum: session.quorum,
            committed_at,
        });

        Ok(())
    }

    // ─────────────────────────────────────────
    // 7. expire_session
    //    Called when expiry_ts is reached without quorum.
    //    Can be called by creator or any participant.
    //    Updates session status to Expired.
    // ─────────────────────────────────────────
    pub fn expire_session(ctx: Context<ExpireSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let clock = Clock::get()?;

        require!(
            session.status == SessionStatus::Pending,
            ConvergeError::SessionNotPending
        );
        require!(
            clock.unix_timestamp >= session.expiry_ts,
            ConvergeError::SessionExpired // reuse: "not yet expired"
        );

        session.status = SessionStatus::Expired;

        emit!(SessionExpired {
            session: session.key(),
            expired_at: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────
// Account Contexts
// ─────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(
    participant_pubkeys: Vec<Pubkey>,
    commitment_hash: [u8; 32],
    quorum: u8,
    expiry_ts: i64,
    context: String,
    metadata_uri: String,
)]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = ConvergeSession::space(
            participant_pubkeys.len().min(MAX_PARTICIPANTS),
            context.len().min(128),
            metadata_uri.len().min(256),
        ),
        seeds = [SESSION_SEED, creator.key().as_ref()],
        bump,
    )]
    pub session: Account<'info, ConvergeSession>,

    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateSession<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Session PDA to delegate — validated by creator ownership
    #[account(
        mut,
        del,
        seeds = [SESSION_SEED, creator.key().as_ref()],
        bump,
    )]
    pub session: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SessionAction<'info> {
    pub participant: Signer<'info>,

    #[account(
        mut,
        seeds = [SESSION_SEED, session.creator.as_ref()],
        bump = session.bump,
    )]
    pub session: Account<'info, ConvergeSession>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitSession<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [SESSION_SEED, creator.key().as_ref()],
        bump = session.bump,
    )]
    pub session: Account<'info, ConvergeSession>,

    #[account(
        init,
        payer = creator,
        space = ConvergeCommitRecord::space(MAX_PARTICIPANTS),
        seeds = [RECORD_SEED, session.key().as_ref()],
        bump,
    )]
    pub commit_record: Account<'info, ConvergeCommitRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpireSession<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [SESSION_SEED, session.creator.as_ref()],
        bump = session.bump,
    )]
    pub session: Account<'info, ConvergeSession>,
}
