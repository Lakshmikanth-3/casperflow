//! CasperFlow — RWA Yield Management Contract
//! Tracks fractional ownership, logs oracle-verified revenue, distributes
//! CSPR yield autonomously, and records every x402 agent expense on-chain.
//!
//! Deployed on Casper Testnet (casper-test).
//! All writes are guarded by caller-is-agent access control.

#![no_std]
extern crate alloc;

use odra::prelude::*;

// ─── Custom errors ────────────────────────────────────────────────────────────

#[odra::odra_error]
pub enum CasperFlowError {
    CallerNotAgent        = 1,
    CallerNotOwner        = 2,
    InsufficientBalance   = 3,
    AlreadyInitialized    = 4,
    InvalidShareCount     = 5,
    DuplicateShareholder  = 6,
    DistributionTooSoon   = 7,
    ZeroShares            = 8,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[odra::event]
pub struct RevenueRecorded {
    pub asset_id:    String,
    pub amount_mote: U512,
    pub source_hash: String,
    pub timestamp:   u64,
}

#[odra::event]
pub struct YieldDistributed {
    pub total_motes:    U512,
    pub holder_count:   u32,
    pub cycle_accuracy: u8,
    pub timestamp:      u64,
}

#[odra::event]
pub struct AgentExpenseLogged {
    pub amount_mote: U512,
    pub purpose:     String,
    pub timestamp:   u64,
}

#[odra::event]
pub struct ShareholderAdded {
    pub holder:    Address,
    pub shares:    u64,
    pub timestamp: u64,
}

// ─── Storage structs ──────────────────────────────────────────────────────────

#[odra::odra_type]
pub struct YieldEvent {
    pub amount_mote: U512,
    pub source_hash: String,
    pub timestamp:   u64,
    pub distributed: bool,
}

#[odra::odra_type]
pub struct X402Expense {
    pub amount_mote: U512,
    pub purpose:     String,
    pub timestamp:   u64,
}

// ─── Contract module ──────────────────────────────────────────────────────────

#[odra::module]
pub struct CasperFlowContract {
    // Configuration (set at init, immutable after)
    asset_id:      Var<String>,
    total_shares:  Var<u64>,
    agent_wallet:  Var<Address>,
    owner:         Var<Address>,

    // Live state
    shareholders:          Mapping<Address, u64>,
    shareholder_list:      List<Address>,
    yield_ledger:          List<YieldEvent>,
    agent_expense_log:     List<X402Expense>,
    accumulated_revenue:   Var<U512>,
    total_distributed:     Var<U512>,
    last_distributed_at:   Var<u64>,
    initialized:           Var<bool>,

    // Distribution cooldown: minimum seconds between distributions (10 min on testnet)
    distribution_cooldown: Var<u64>,
}

#[odra::module]
impl CasperFlowContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Called once after deployment.
    /// `agent_wallet`  — the autonomous agent's on-chain address (only caller
    ///                   that may write revenue / expenses / trigger distribution)
    /// `asset_id`      — e.g. "parking-blox-lot-001"
    /// `total_shares`  — e.g. 1000
    pub fn init(
        &mut self,
        agent_wallet:  Address,
        asset_id:      String,
        total_shares:  u64,
        cooldown_secs: u64,
    ) {
        if self.initialized.get_or_default() {
            self.env().revert(CasperFlowError::AlreadyInitialized);
        }
        if total_shares == 0 {
            self.env().revert(CasperFlowError::InvalidShareCount);
        }
        self.owner.set(self.env().caller());
        self.agent_wallet.set(agent_wallet);
        self.asset_id.set(asset_id);
        self.total_shares.set(total_shares);
        self.accumulated_revenue.set(U512::zero());
        self.total_distributed.set(U512::zero());
        self.last_distributed_at.set(0u64);
        self.distribution_cooldown.set(cooldown_secs);
        self.initialized.set(true);
    }

    // ── Admin: shareholder management (owner only) ────────────────────────────

    /// Register a fractional holder. Called by owner during setup.
    pub fn add_shareholder(&mut self, holder: Address, shares: u64) {
        self.assert_caller_is_owner();
        if shares == 0 {
            self.env().revert(CasperFlowError::ZeroShares);
        }
        // Prevent duplicate registration (shares would be overwritten incorrectly)
        if self.shareholders.get(&holder).unwrap_or(0) > 0 {
            self.env().revert(CasperFlowError::DuplicateShareholder);
        }
        let total = self.total_shares.get_or_default();
        let existing_total: u64 = self.sum_allocated_shares();
        if existing_total + shares > total {
            self.env().revert(CasperFlowError::InvalidShareCount);
        }
        self.shareholders.set(&holder, shares);
        self.shareholder_list.push(holder);
        self.env().emit_event(ShareholderAdded {
            holder,
            shares,
            timestamp: self.env().get_block_time(),
        });
    }

    // ── Agent writes ──────────────────────────────────────────────────────────

    /// Called by the agent after receiving verified oracle data.
    /// `amount_mote`  — revenue in CSPR motos (1 CSPR = 1_000_000_000 motos)
    /// `source_hash`  — SHA-256 of the raw oracle JSON response (on-chain audit trail)
    pub fn record_revenue(&mut self, amount_mote: U512, source_hash: String) {
        self.assert_caller_is_agent();
        let ts = self.env().get_block_time();
        let event = YieldEvent {
            amount_mote,
            source_hash: source_hash.clone(),
            timestamp: ts,
            distributed: false,
        };
        self.yield_ledger.push(event);
        let acc = self.accumulated_revenue.get_or_default();
        self.accumulated_revenue.set(acc + amount_mote);
        self.env().emit_event(RevenueRecorded {
            asset_id:    self.asset_id.get_or_default(),
            amount_mote,
            source_hash,
            timestamp:   ts,
        });
    }

    /// Trigger proportional yield distribution to all fractional holders.
    /// Transfers CSPR directly from this contract's purse to each holder.
    /// Guarded by: (a) caller-is-agent, (b) distribution cooldown.
    pub fn distribute_yield(&mut self) {
        self.assert_caller_is_agent();
        self.assert_cooldown_passed();

        let total_to_distribute = self.accumulated_revenue.get_or_default();
        if total_to_distribute == U512::zero() {
            return; // nothing to distribute
        }

        let total_shares = self.total_shares.get_or_default() as u128;
        let holder_count = self.shareholder_list.len() as u32;
        let mut distributed_total = U512::zero();

        for i in 0..holder_count {
            let holder = self.shareholder_list.get(i).unwrap();
            let shares = self.shareholders.get(&holder).unwrap_or(0) as u128;
            if shares == 0 {
                continue;
            }
            // Proportional: (shares / total_shares) × total_to_distribute
            let share_amount = (total_to_distribute * U512::from(shares))
                / U512::from(total_shares);
            if share_amount > U512::zero() {
                self.env().transfer_tokens(&holder, &share_amount);
                distributed_total += share_amount;
            }
        }

        // Mark all pending revenue as distributed
        self.accumulated_revenue.set(U512::zero());
        let prev_total = self.total_distributed.get_or_default();
        self.total_distributed.set(prev_total + distributed_total);
        self.last_distributed_at.set(self.env().get_block_time());

        // Compute on-chain accuracy from the distribution vs. accumulated
        // Accuracy = min(100, distributed_total * 100 / total_to_distribute)
        let accuracy: u8 = if total_to_distribute > U512::zero() {
            let pct = (distributed_total * U512::from(100u64)) / total_to_distribute;
            pct.as_u64().min(100) as u8
        } else {
            100u8
        };

        self.env().emit_event(YieldDistributed {
            total_motes:    distributed_total,
            holder_count,
            cycle_accuracy: accuracy,
            timestamp:      self.env().get_block_time(),
        });
    }

    /// Called by the agent after each x402 payment to keep an on-chain expense
    /// ledger. Fully transparent — anyone can read the agent's cost history.
    pub fn log_agent_expense(&mut self, amount_mote: U512, purpose: String) {
        self.assert_caller_is_agent();
        let ts = self.env().get_block_time();
        self.agent_expense_log.push(X402Expense {
            amount_mote,
            purpose: purpose.clone(),
            timestamp: ts,
        });
        self.env().emit_event(AgentExpenseLogged {
            amount_mote,
            purpose,
            timestamp: ts,
        });
    }

    // ── View entry points ─────────────────────────────────────────────────────

    pub fn get_asset_id(&self) -> String {
        self.asset_id.get_or_default()
    }

    pub fn get_total_shares(&self) -> u64 {
        self.total_shares.get_or_default()
    }

    pub fn get_shareholder_shares(&self, holder: Address) -> u64 {
        self.shareholders.get(&holder).unwrap_or(0)
    }

    pub fn get_accumulated_revenue(&self) -> U512 {
        self.accumulated_revenue.get_or_default()
    }

    pub fn get_total_distributed(&self) -> U512 {
        self.total_distributed.get_or_default()
    }

    pub fn get_last_distributed_at(&self) -> u64 {
        self.last_distributed_at.get_or_default()
    }

    pub fn get_holder_count(&self) -> u32 {
        self.shareholder_list.len() as u32
    }

    pub fn get_agent_wallet(&self) -> Address {
        self.agent_wallet.get().unwrap()
    }

    pub fn get_expense_count(&self) -> u32 {
        self.agent_expense_log.len() as u32
    }

    pub fn get_yield_event_count(&self) -> u32 {
        self.yield_ledger.len() as u32
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn assert_caller_is_agent(&self) {
        let agent = self.agent_wallet.get().unwrap();
        if self.env().caller() != agent {
            self.env().revert(CasperFlowError::CallerNotAgent);
        }
    }

    fn assert_caller_is_owner(&self) {
        let owner = self.owner.get().unwrap();
        if self.env().caller() != owner {
            self.env().revert(CasperFlowError::CallerNotOwner);
        }
    }

    fn assert_cooldown_passed(&self) {
        let cooldown = self.distribution_cooldown.get_or_default();
        let last = self.last_distributed_at.get_or_default();
        let now = self.env().get_block_time();
        // block_time is in milliseconds; cooldown is in seconds
        if last > 0 && now < last + (cooldown * 1000) {
            self.env().revert(CasperFlowError::DistributionTooSoon);
        }
    }

    fn sum_allocated_shares(&self) -> u64 {
        let count = self.shareholder_list.len() as u32;
        let mut total: u64 = 0;
        for i in 0..count {
            let holder = self.shareholder_list.get(i).unwrap();
            total += self.shareholders.get(&holder).unwrap_or(0);
        }
        total
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};

    fn setup() -> (HostEnv, CasperFlowContractHostRef) {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        env.set_caller(owner);
        let contract = CasperFlowContractDeployer::init(
            &env,
            agent,
            "parking-blox-lot-001".into(),
            1000u64,
            600u64, // 10-min cooldown
        );
        (env, contract)
    }

    #[test]
    fn test_add_shareholder_and_record_revenue() {
        let (env, mut contract) = setup();
        let owner = env.get_account(0);
        let holder1 = env.get_account(2);
        env.set_caller(owner);
        contract.add_shareholder(holder1, 100);
        assert_eq!(contract.get_shareholder_shares(holder1), 100);

        // Record revenue as agent
        let agent = env.get_account(1);
        env.set_caller(agent);
        contract.record_revenue(U512::from(1_000_000_000u64), "abc123hash".into());
        assert_eq!(
            contract.get_accumulated_revenue(),
            U512::from(1_000_000_000u64)
        );
    }

    #[test]
    #[should_panic]
    fn test_non_agent_cannot_record_revenue() {
        let (env, mut contract) = setup();
        let rando = env.get_account(3);
        env.set_caller(rando);
        contract.record_revenue(U512::from(1_000u64), "hash".into());
    }

    #[test]
    #[should_panic]
    fn test_duplicate_shareholder_rejected() {
        let (env, mut contract) = setup();
        let owner = env.get_account(0);
        let holder1 = env.get_account(2);
        env.set_caller(owner);
        contract.add_shareholder(holder1, 100);
        contract.add_shareholder(holder1, 50); // should panic
    }
}
