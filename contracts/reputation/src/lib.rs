//! CasperFlow Reputation Contract — Non-Transferable On-Chain Agent Trust Ledger
//!
//! Minted once per agent at deployment.
//! Updated by the agent after every distribution cycle.
//! Trust tier is derived on-chain from (uptime_cycles, accuracy_score).
//! Any external protocol can call `get_trust_tier` before granting funds to this agent.

#![no_std]
extern crate alloc;

use alloc::string::String;
use odra::prelude::*;
use odra::prelude::*; use odra::casper_types::U512;

// ─── Trust tier ───────────────────────────────────────────────────────────────

#[odra::odra_type]

pub enum TrustTier {
    Bronze,   // uptime < 100 OR accuracy < 70
    Silver,   // uptime >= 100 AND accuracy >= 70
    Gold,     // uptime >= 500 AND accuracy >= 85
    Platinum, // uptime >= 1000 AND accuracy >= 95
}

impl TrustTier {
    pub fn from_scores(uptime_cycles: u64, accuracy_score: u8) -> Self {
        if uptime_cycles >= 1000 && accuracy_score >= 95 {
            TrustTier::Platinum
        } else if uptime_cycles >= 500 && accuracy_score >= 85 {
            TrustTier::Gold
        } else if uptime_cycles >= 100 && accuracy_score >= 70 {
            TrustTier::Silver
        } else {
            TrustTier::Bronze
        }
    }
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[odra::odra_error]
pub enum ReputationError {
    AlreadyMinted      = 1,
    NotMinted          = 2,
    CallerNotAgent     = 3,
    CallerNotOwner     = 4,
    AccuracyOutOfRange = 5,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[odra::event]
pub struct ReputationMinted {
    pub agent_address: Address,
    pub minted_at:     u64,
}

#[odra::event]
pub struct ReputationUpdated {
    pub agent_address:    Address,
    pub accuracy_score:   u8,
    pub uptime_cycles:    u64,
    pub total_distributed: U512,
    pub trust_tier:       String,
    pub timestamp:        u64,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[odra::module]
pub struct CasperFlowReputationContract {
    owner:             Var<Address>,
    agent_address:     Var<Address>,
    accuracy_score:    Var<u8>,
    uptime_cycles:     Var<u64>,
    total_distributed: Var<U512>,
    last_active:       Var<u64>,
    minted_at:         Var<u64>,
    minted:            Var<bool>,
    // Casperflow contract that is authorised to push updates
    casperflow_contract: Var<Address>,
}

#[odra::module]
impl CasperFlowReputationContract {
    // ── Init ──────────────────────────────────────────────────────────────────

    pub fn init(&mut self, casperflow_contract: Address) {
        self.owner.set(self.env().caller());
        self.casperflow_contract.set(casperflow_contract);
        self.minted.set(false);
    }

    // ── Mint (called once at deployment by owner) ─────────────────────────────

    pub fn mint(&mut self, agent_address: Address) {
        self.assert_caller_is_owner();
        if self.minted.get_or_default() {
            self.env().revert(ReputationError::AlreadyMinted);
        }
        let now = self.env().get_block_time();
        self.agent_address.set(agent_address);
        self.accuracy_score.set(100u8); // starts perfect; drops with bad cycles
        self.uptime_cycles.set(0u64);
        self.total_distributed.set(U512::zero());
        self.last_active.set(now);
        self.minted_at.set(now);
        self.minted.set(true);
        self.env().emit_event(ReputationMinted {
            agent_address,
            minted_at: now,
        });
    }

    // ── Update (called by agent after each distribution cycle) ────────────────
    //
    // `accuracy`           — 0–100, percentage match between oracle revenue
    //                        and actual distributed amount for this cycle
    // `distributed_delta`  — additional CSPR motos distributed this cycle

    pub fn update_reputation(&mut self, accuracy: u8, distributed_delta: U512) {
        self.assert_minted();
        self.assert_caller_is_authorised();
        if accuracy > 100 {
            self.env().revert(ReputationError::AccuracyOutOfRange);
        }

        // EMA-style accuracy: new_score = (old_score * 9 + new_accuracy) / 10
        // This smooths out one-off bad cycles without crashing the score.
        let old_acc = self.accuracy_score.get_or_default() as u32;
        let smoothed = ((old_acc * 9) + accuracy as u32) / 10;
        let new_acc = smoothed.min(100) as u8;
        self.accuracy_score.set(new_acc);

        let cycles = self.uptime_cycles.get_or_default() + 1;
        self.uptime_cycles.set(cycles);

        let prev_dist = self.total_distributed.get_or_default();
        self.total_distributed.set(prev_dist + distributed_delta);

        let now = self.env().get_block_time();
        self.last_active.set(now);

        let tier = TrustTier::from_scores(cycles, new_acc);
        let tier_str: String = match tier {
            TrustTier::Platinum => "Platinum".into(),
            TrustTier::Gold     => "Gold".into(),
            TrustTier::Silver   => "Silver".into(),
            TrustTier::Bronze   => "Bronze".into(),
        };

        self.env().emit_event(ReputationUpdated {
            agent_address:    self.agent_address.get().unwrap(),
            accuracy_score:   new_acc,
            uptime_cycles:    cycles,
            total_distributed: prev_dist + distributed_delta,
            trust_tier:       tier_str,
            timestamp:        now,
        });
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    pub fn get_accuracy_score(&self) -> u8 {
        self.accuracy_score.get_or_default()
    }

    pub fn get_uptime_cycles(&self) -> u64 {
        self.uptime_cycles.get_or_default()
    }

    pub fn get_total_distributed(&self) -> U512 {
        self.total_distributed.get_or_default()
    }

    pub fn get_last_active(&self) -> u64 {
        self.last_active.get_or_default()
    }

    pub fn get_minted_at(&self) -> u64 {
        self.minted_at.get_or_default()
    }

    pub fn get_agent_address(&self) -> Address {
        self.agent_address.get().unwrap()
    }

    pub fn get_trust_tier(&self) -> String {
        let cycles = self.uptime_cycles.get_or_default();
        let acc    = self.accuracy_score.get_or_default();
        match TrustTier::from_scores(cycles, acc) {
            TrustTier::Platinum => "Platinum".into(),
            TrustTier::Gold     => "Gold".into(),
            TrustTier::Silver   => "Silver".into(),
            TrustTier::Bronze   => "Bronze".into(),
        }
    }

    pub fn get_reputation_summary(&self) -> String {
        alloc::format!("{}-{}-{}-{}-{}", self.get_accuracy_score(), self.get_uptime_cycles(), self.get_total_distributed(), self.get_last_active(), self.get_trust_tier())
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn assert_minted(&self) {
        if !self.minted.get_or_default() {
            self.env().revert(ReputationError::NotMinted);
        }
    }

    fn assert_caller_is_owner(&self) {
        if self.env().caller() != self.owner.get().unwrap() {
            self.env().revert(ReputationError::CallerNotOwner);
        }
    }

    /// Authorised callers: the agent wallet OR the CasperFlow contract itself
    fn assert_caller_is_authorised(&self) {
        let caller = self.env().caller();
        let agent  = self.agent_address.get().unwrap();
        let cf     = self.casperflow_contract.get().unwrap();
        if caller != agent && caller != cf {
            self.env().revert(ReputationError::CallerNotAgent);
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};

    #[test]
    fn test_tier_logic() {
        assert_eq!(TrustTier::from_scores(0, 50), TrustTier::Bronze);
        assert_eq!(TrustTier::from_scores(100, 70), TrustTier::Silver);
        assert_eq!(TrustTier::from_scores(500, 85), TrustTier::Gold);
        assert_eq!(TrustTier::from_scores(1000, 95), TrustTier::Platinum);
        // Boundary — high uptime but low accuracy stays Bronze
        assert_eq!(TrustTier::from_scores(2000, 60), TrustTier::Bronze);
    }

    #[test]
    fn test_mint_and_update() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let cf_contract = env.get_account(2); // mock contract address for test

        env.set_caller(owner);
        let mut contract = CasperFlowReputationContractDeployer::init(&env, cf_contract);
        contract.mint(agent);

        // Agent updates reputation
        env.set_caller(agent);
        contract.update_reputation(94, U512::from(1_000_000_000u64));
        assert_eq!(contract.get_uptime_cycles(), 1);
        // EMA: (100*9 + 94) / 10 = 99
        assert_eq!(contract.get_accuracy_score(), 99);
        assert_eq!(contract.get_trust_tier(), "Bronze"); // 1 cycle, needs 100 for Silver
    }

    #[test]
    #[should_panic]
    fn test_double_mint_rejected() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let cf_contract = env.get_account(2);
        env.set_caller(owner);
        let mut contract = CasperFlowReputationContractDeployer::init(&env, cf_contract);
        contract.mint(agent);
        contract.mint(agent); // should panic
    }
}
