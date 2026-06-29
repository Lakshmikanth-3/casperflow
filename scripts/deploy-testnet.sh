#!/bin/bash
# scripts/deploy-testnet.sh
# CasperFlow — Full Testnet Deployment Script
#
# Prerequisites:
#   - cargo-odra installed (cargo install cargo-odra)
#   - Agent keys generated: ./keys/agent_secret_key.pem
#   - Oracle keys generated: ./keys/oracle_secret_key.pem
#   - .env files configured with CSPR_CLOUD_API_KEY etc.
#   - Agent and oracle wallets funded from https://testnet.cspr.live/tools/faucet
#
# Usage:
#   bash scripts/deploy-testnet.sh
#
# After deployment, contract hashes are printed and must be added to:
#   - agent/.env (CASPERFLOW_CONTRACT_HASH, REPUTATION_CONTRACT_HASH)
#   - oracle-server/.env (same)
#   - frontend/.env.local (NEXT_PUBLIC_CASPERFLOW_CONTRACT_HASH etc.)

set -euo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  CasperFlow — Casper Testnet Deployment"
echo "═══════════════════════════════════════════════════════════"

# ── 1. Validate prerequisites ────────────────────────────────────────────────
if ! command -v cargo-odra &>/dev/null; then
    echo "ERROR: cargo-odra not found. Install with: cargo install cargo-odra"
    exit 1
fi

if [ ! -f "./keys/agent_secret_key.pem" ]; then
    echo "ERROR: Agent key not found at ./keys/agent_secret_key.pem"
    echo "Generate with: casper-client keygen ./keys"
    exit 1
fi

if [ ! -f "./keys/oracle_secret_key.pem" ]; then
    echo "ERROR: Oracle key not found at ./keys/oracle_secret_key.pem"
    echo "Generate with: casper-client keygen ./keys/oracle"
    exit 1
fi

AGENT_PUBLIC_KEY=$(casper-client account-address --secret-key ./keys/agent_secret_key.pem 2>/dev/null | tr -d '\n')
ORACLE_PUBLIC_KEY=$(casper-client account-address --secret-key ./keys/oracle_secret_key.pem 2>/dev/null | tr -d '\n')

echo "Agent public key:  $AGENT_PUBLIC_KEY"
echo "Oracle public key: $ORACLE_PUBLIC_KEY"

# ── 2. Build contracts ────────────────────────────────────────────────────────
echo ""
echo "[1/4] Building Odra contracts..."
cd contracts/casperflow
cargo odra build
echo "✓ CasperFlow contract built"
cd ../reputation
cargo odra build
echo "✓ Reputation contract built"
cd ../..

# ── 3. Deploy CasperFlow contract ─────────────────────────────────────────────
echo ""
echo "[2/4] Deploying CasperFlow contract to Casper Testnet..."

CASPERFLOW_DEPLOY=$(casper-client put-deploy \
    --node-address https://rpc.testnet.cspr.live \
    --chain-name casper-test \
    --secret-key ./keys/agent_secret_key.pem \
    --payment-amount 150000000000 \
    --session-path ./contracts/casperflow/wasm/casperflow.wasm \
    --session-arg "agent_wallet:key='${AGENT_PUBLIC_KEY}'" \
    --session-arg "asset_id:string='parking-blox-lot-001'" \
    --session-arg "total_shares:u64='1000'" \
    --session-arg "cooldown_secs:u64='600'" \
    2>&1)

CASPERFLOW_DEPLOY_HASH=$(echo "$CASPERFLOW_DEPLOY" | python3 -c "import sys, json; print(json.load(sys.stdin)['result']['deploy_hash'])" 2>/dev/null || echo "")

if [ -z "$CASPERFLOW_DEPLOY_HASH" ]; then
    echo "ERROR: CasperFlow deploy failed. Output:"
    echo "$CASPERFLOW_DEPLOY"
    exit 1
fi

echo "CasperFlow deploy hash: $CASPERFLOW_DEPLOY_HASH"
echo "Waiting for finality (60s)..."
sleep 60

CASPERFLOW_CONTRACT_HASH=$(casper-client get-deploy \
    --node-address https://rpc.testnet.cspr.live \
    "$CASPERFLOW_DEPLOY_HASH" 2>/dev/null | \
    python3 -c "
import sys, json
d = json.load(sys.stdin)
for er in d['result']['execution_results']:
    transforms = er['result']['Success']['effect']['transforms']
    for t in transforms:
        if 'WriteContract' in str(t.get('transform', '')):
            print(t['key'])
            break
" 2>/dev/null || echo "")

echo "✓ CasperFlow contract: $CASPERFLOW_CONTRACT_HASH"

# ── 4. Deploy Reputation contract ─────────────────────────────────────────────
echo ""
echo "[3/4] Deploying Reputation contract..."

REPUTATION_DEPLOY=$(casper-client put-deploy \
    --node-address https://rpc.testnet.cspr.live \
    --chain-name casper-test \
    --secret-key ./keys/agent_secret_key.pem \
    --payment-amount 150000000000 \
    --session-path ./contracts/reputation/wasm/casperflow_reputation.wasm \
    --session-arg "casperflow_contract:key='${CASPERFLOW_CONTRACT_HASH}'" \
    2>&1)

REPUTATION_DEPLOY_HASH=$(echo "$REPUTATION_DEPLOY" | python3 -c "import sys, json; print(json.load(sys.stdin)['result']['deploy_hash'])" 2>/dev/null || echo "")
echo "Reputation deploy hash: $REPUTATION_DEPLOY_HASH"
echo "Waiting for finality (60s)..."
sleep 60

REPUTATION_CONTRACT_HASH=$(casper-client get-deploy \
    --node-address https://rpc.testnet.cspr.live \
    "$REPUTATION_DEPLOY_HASH" 2>/dev/null | \
    python3 -c "
import sys, json
d = json.load(sys.stdin)
for er in d['result']['execution_results']:
    transforms = er['result']['Success']['effect']['transforms']
    for t in transforms:
        if 'WriteContract' in str(t.get('transform', '')):
            print(t['key'])
            break
" 2>/dev/null || echo "")

echo "✓ Reputation contract: $REPUTATION_CONTRACT_HASH"

# ── 5. Mint Agent Reputation NFT ──────────────────────────────────────────────
echo ""
echo "[4/4] Minting Agent Reputation NFT..."

casper-client put-deploy \
    --node-address https://rpc.testnet.cspr.live \
    --chain-name casper-test \
    --secret-key ./keys/agent_secret_key.pem \
    --payment-amount 3000000000 \
    --session-hash "$REPUTATION_CONTRACT_HASH" \
    --session-entry-point mint \
    --session-arg "agent_address:key='${AGENT_PUBLIC_KEY}'"

echo "✓ Reputation NFT minted"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE — Add these to your .env files:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "CASPERFLOW_CONTRACT_HASH=$CASPERFLOW_CONTRACT_HASH"
echo "REPUTATION_CONTRACT_HASH=$REPUTATION_CONTRACT_HASH"
echo "AGENT_PUBLIC_KEY=$AGENT_PUBLIC_KEY"
echo ""
echo "Verify on Casper Testnet Explorer:"
echo "  https://testnet.cspr.live/contract/$CASPERFLOW_CONTRACT_HASH"
echo "  https://testnet.cspr.live/contract/$REPUTATION_CONTRACT_HASH"
echo ""
echo "Deploy hashes:"
echo "  CasperFlow: $CASPERFLOW_DEPLOY_HASH"
echo "  Reputation: $REPUTATION_DEPLOY_HASH"
