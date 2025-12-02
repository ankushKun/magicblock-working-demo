use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};

declare_id!("AqN6S5LJ4m1C5bQnr8996YFRu3jA1YnwaiG7eGEvD3oD");

const BOARD_SIZE: u8 = 100;
const INITIAL_X: u8 = 10;
const INITIAL_Y: u8 = 10;

#[ephemeral]
#[program]
pub mod test_2 {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let board = &mut ctx.accounts.board;
        board.authority = ctx.accounts.authority.key();
        msg!("Board initialized by: {:?}", board.authority);
        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.authority = ctx.accounts.authority.key();
        player.x = INITIAL_X;
        player.y = INITIAL_Y;
        player.bump = ctx.bumps.player;
        player.session_key = None;

        msg!(
            "Player {} joined at position ({}, {})",
            player.authority,
            player.x,
            player.y
        );
        Ok(())
    }

    pub fn register_session_key(
        ctx: Context<RegisterSessionKey>,
        session_key: Pubkey,
    ) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.session_key = Some(session_key);

        msg!(
            "Session key {} registered for player {}",
            session_key,
            player.authority
        );
        Ok(())
    }

    pub fn revoke_session_key(ctx: Context<RevokeSessionKey>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.session_key = None;

        msg!("Session key revoked for player {}", player.authority);
        Ok(())
    }

    pub fn move_player(ctx: Context<MovePlayer>, x_direction: i8, y_direction: i8) -> Result<()> {
        let player = &mut ctx.accounts.player;

        let new_x = (player.x as i16 + x_direction as i16)
            .max(0)
            .min(BOARD_SIZE as i16 - 1) as u8;

        let new_y = (player.y as i16 + y_direction as i16)
            .max(0)
            .min(BOARD_SIZE as i16 - 1) as u8;

        player.x = new_x;
        player.y = new_y;

        msg!(
            "Player {} moved to position ({}, {})",
            player.authority,
            player.x,
            player.y
        );
        Ok(())
    }

    pub fn delegate_player(ctx: Context<DelegatePlayer>) -> Result<()> {
        let authority = ctx.accounts.authority.key();
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[b"player", authority.as_ref()],
            DelegateConfig {
                // Optional: specify ER validator from remaining accounts
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        msg!("Player {} delegated to Ephemeral Rollup", authority);
        Ok(())
    }

    pub fn commit_player(ctx: Context<CommitPlayer>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.player.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!("Player state committed to base layer");
        Ok(())
    }

    pub fn undelegate_player(ctx: Context<CommitPlayer>) -> Result<()> {
        // Commit and undelegate the account
        // Note: Session key will be cleared by the frontend after undelegation
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.player.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!("Player undelegated from Ephemeral Rollup");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Board::INIT_SPACE,
        seeds = [b"board"],
        bump
    )]
    pub board: Account<'info, Board>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Player::INIT_SPACE,
        seeds = [b"player", authority.key().as_ref()],
        bump
    )]
    pub player: Account<'info, Player>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MovePlayer<'info> {
    #[account(
        mut,
        seeds = [b"player", player.authority.as_ref()],
        bump = player.bump,
        constraint = signer.key() == player.authority || Some(signer.key()) == player.session_key
    )]
    pub player: Account<'info, Player>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterSessionKey<'info> {
    #[account(
        mut,
        seeds = [b"player", authority.key().as_ref()],
        bump = player.bump,
        has_one = authority
    )]
    pub player: Account<'info, Player>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RevokeSessionKey<'info> {
    #[account(
        mut,
        seeds = [b"player", authority.key().as_ref()],
        bump = player.bump,
        has_one = authority
    )]
    pub player: Account<'info, Player>,
    pub authority: Signer<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    /// CHECK: Checked by delegate macro
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitPlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub player: Account<'info, Player>,
}

#[account]
#[derive(InitSpace)]
pub struct Board {
    pub authority: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Player {
    pub authority: Pubkey,
    pub x: u8,
    pub y: u8,
    pub bump: u8,
    pub session_key: Option<Pubkey>,
}
