const fs = require('fs');
const path = require('path');
const { Keys } = require('casper-js-sdk');

console.log("═══════════════════════════════════════════════════════════");
console.log("  CasperFlow — Key Generation (Node.js)");
console.log("═══════════════════════════════════════════════════════════");

const keysDir = path.join(__dirname, '..', 'keys');
const oracleKeysDir = path.join(keysDir, 'oracle');

// Ensure directories exist
if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });
if (!fs.existsSync(oracleKeysDir)) fs.mkdirSync(oracleKeysDir, { recursive: true });

// Generate Agent Keys
const agentKeys = Keys.Ed25519.new();
const agentPrivPem = agentKeys.exportPrivateKeyInPem();
const agentPubPem = agentKeys.exportPublicKeyInPem();
fs.writeFileSync(path.join(keysDir, 'agent_secret_key.pem'), agentPrivPem);
fs.writeFileSync(path.join(keysDir, 'agent_public_key.pem'), agentPubPem);
console.log("✓ Agent keys: ./keys/agent_secret_key.pem + ./keys/agent_public_key.pem");

// Generate Oracle Keys
const oracleKeys = Keys.Ed25519.new();
const oraclePrivPem = oracleKeys.exportPrivateKeyInPem();
const oraclePubPem = oracleKeys.exportPublicKeyInPem();
fs.writeFileSync(path.join(oracleKeysDir, 'oracle_secret_key.pem'), oraclePrivPem);
fs.writeFileSync(path.join(oracleKeysDir, 'oracle_public_key.pem'), oraclePubPem);
console.log("✓ Oracle keys: ./keys/oracle/oracle_secret_key.pem + ./keys/oracle/oracle_public_key.pem");

const agentAcct = agentKeys.accountHex();
const oracleAcct = oracleKeys.accountHex();

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  Copy these into your .env files:");
console.log("═══════════════════════════════════════════════════════════\n");

console.log("Agent:");
console.log("  AGENT_PRIVATE_KEY_PATH=./keys/agent_secret_key.pem");
console.log(`  AGENT_PUBLIC_KEY=${agentAcct}\n`);

console.log("Oracle:");
console.log("  ORACLE_PRIVATE_KEY_PATH=./keys/oracle/oracle_secret_key.pem");
console.log(`  ORACLE_WALLET_ADDRESS=${oracleAcct}\n`);

console.log("Fund both wallets from Casper Testnet Faucet:");
console.log(`  Agent:  https://testnet.cspr.live/tools/faucet?account=${agentAcct}`);
console.log(`  Oracle: https://testnet.cspr.live/tools/faucet?account=${oracleAcct}\n`);

console.log("NEVER commit .pem files to version control.");
