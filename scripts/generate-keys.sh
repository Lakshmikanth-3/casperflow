#!/bin/bash
# scripts/generate-keys.sh
# Generate Ed25519 keypairs for the agent and oracle server wallets.
# Uses casper-client CLI (install: https://docs.casper.network/developers/prerequisites/)

set -euo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  CasperFlow — Key Generation"
echo "═══════════════════════════════════════════════════════════"

if ! command -v casper-client &>/dev/null; then
    echo "ERROR: casper-client not found."
    echo "Install from: https://docs.casper.network/developers/prerequisites/"
    exit 1
fi

# Agent wallet keys
mkdir -p ./keys
casper-client keygen ./keys
echo "✓ Agent keys: ./keys/secret_key.pem + ./keys/public_key.pem"

# Oracle wallet keys (separate directory)
mkdir -p ./keys/oracle
casper-client keygen ./keys/oracle
echo "✓ Oracle keys: ./keys/oracle/secret_key.pem + ./keys/oracle/public_key.pem"

# Print public keys / account addresses
AGENT_ACCT=$(casper-client account-address --secret-key ./keys/secret_key.pem)
ORACLE_ACCT=$(casper-client account-address --secret-key ./keys/oracle/secret_key.pem)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Copy these into your .env files:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Agent:"
echo "  AGENT_PRIVATE_KEY_PATH=./keys/secret_key.pem"
echo "  AGENT_PUBLIC_KEY=$AGENT_ACCT"
echo ""
echo "Oracle:"
echo "  ORACLE_PRIVATE_KEY_PATH=./keys/oracle/secret_key.pem"
echo "  ORACLE_WALLET_ADDRESS=$ORACLE_ACCT"
echo ""
echo "Fund both wallets from Casper Testnet Faucet:"
echo "  Agent:  https://testnet.cspr.live/tools/faucet?account=$AGENT_ACCT"
echo "  Oracle: https://testnet.cspr.live/tools/faucet?account=$ORACLE_ACCT"
echo ""
echo "NEVER commit .pem files to version control."
