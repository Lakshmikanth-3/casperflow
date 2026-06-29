const fs = require("fs");
const path = require("path");
const { CasperClient, Keys, DeployUtil, RuntimeArgs, CLValueBuilder, CLPublicKey } = require("casper-js-sdk");

const NODE_URL = "https://rpc.testnet.cspr.live";
const CHAIN_NAME = "casper-test";

const client = new CasperClient(NODE_URL);

async function deployContract(wasmPath, args, paymentAmount, keys, description) {
  console.log(`\n[Deploy] ${description}...`);
  const wasm = new Uint8Array(fs.readFileSync(wasmPath));

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(
      keys.publicKey,
      CHAIN_NAME,
      1,
      1_800_000, // 30 min
      [],
      Date.now()
    ),
    DeployUtil.ExecutableDeployItem.newModuleBytes(wasm, args),
    DeployUtil.standardPayment(paymentAmount)
  );

  const signedDeploy = client.signDeploy(deploy, keys);
  const deployHash = await client.putDeploy(signedDeploy);
  
  console.log(`Deploy Hash: ${deployHash}`);
  console.log(`Waiting for finality...`);

  // Poll for finality
  while (true) {
    try {
      const result = await client.getDeploy(deployHash);
      if (result[1].execution_results.length > 0) {
        const execResult = result[1].execution_results[0].result;
        if (execResult.Success) {
          // Extract Contract Hash from transforms
          const transforms = execResult.Success.effect.transforms;
          const contractTransform = transforms.find(t => t.transform?.WriteContract);
          if (contractTransform) {
            console.log(`✓ Success! Contract Hash: ${contractTransform.key}`);
            return contractTransform.key;
          } else {
             // Try to find WriteContractWasm or similar if it's Odra
             for (const t of transforms) {
                if (t.key.startsWith("contract-") && typeof t.transform === "string" && t.transform === "WriteContract") {
                    console.log(`✓ Success! Contract Hash: ${t.key}`);
                    return t.key;
                }
             }
            console.log(`✓ Success! But could not find contract hash in transforms. Raw result:`, JSON.stringify(execResult.Success));
            // Odra usually writes to a key starting with "contract-"
            const contractKey = transforms.find(t => t.key.startsWith("contract-"))?.key;
            return contractKey;
          }
        }
        if (execResult.Failure) {
          throw new Error(`Deploy failed on-chain: ${execResult.Failure.error_message}`);
        }
      }
    } catch (e) {
      if (!e.message.includes("not found")) {
         // ignore "deploy not found" while it's pending
      }
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

async function callEntryPoint(contractHash, entryPoint, args, paymentAmount, keys, description) {
  console.log(`\n[Call] ${description}...`);
  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(keys.publicKey, CHAIN_NAME, 1, 1_800_000, [], Date.now()),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(contractHash.replace("contract-", ""), "hex")),
      entryPoint,
      args
    ),
    DeployUtil.standardPayment(paymentAmount)
  );
  const signedDeploy = client.signDeploy(deploy, keys);
  const deployHash = await client.putDeploy(signedDeploy);
  console.log(`Deploy Hash: ${deployHash}`);
  console.log(`Waiting for finality...`);
  while (true) {
    try {
      const result = await client.getDeploy(deployHash);
      if (result[1].execution_results.length > 0) {
        const execResult = result[1].execution_results[0].result;
        if (execResult.Success) {
          console.log(`✓ Success!`);
          return;
        }
        if (execResult.Failure) {
          throw new Error(`Deploy failed on-chain: ${execResult.Failure.error_message}`);
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 10000));
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CasperFlow — Real Node.js Testnet Deployment");
  console.log("═══════════════════════════════════════════════════════════");

  // Load keys
  const agentKeyPath = path.resolve(__dirname, "../keys/agent_secret_key.pem");
  if (!fs.existsSync(agentKeyPath)) {
    console.error("Missing agent keys! Run generate-keys.js first.");
    process.exit(1);
  }
  const keys = Keys.Ed25519.loadKeyPairFromPrivateFile(agentKeyPath);
  console.log(`Deployer Wallet: ${keys.publicKey.toHex()}`);
  
  // 1. Deploy CasperFlow
  const cfWasm = path.resolve(__dirname, "../contracts/casperflow/wasm/casperflow.wasm");
  if (!fs.existsSync(cfWasm)) {
     console.log("Building CasperFlow Odra contract...");
     require("child_process").execSync("cargo odra build", { cwd: path.resolve(__dirname, "../contracts/casperflow"), stdio: 'inherit' });
  }

  const userPublicKeyHex = "0202c0d31a722833dbf9fb38de1d43ed2c9d1a6af558d128d076163cc5b16fa27147";
  let userPubKey;
  try {
     userPubKey = CLPublicKey.fromHex(userPublicKeyHex);
  } catch (e) {
     userPubKey = keys.publicKey; // fallback to agent key if parse fails
  }

  const cfArgs = RuntimeArgs.fromMap({
    agent_wallet: CLValueBuilder.key(keys.publicKey),
    asset_id: CLValueBuilder.string("parking-blox-lot-001"),
    total_shares: CLValueBuilder.u64(1000),
    cooldown_secs: CLValueBuilder.u64(600)
  });
  
  const cfHash = await deployContract(cfWasm, cfArgs, 150_000_000_000, keys, "Deploying CasperFlow RWA Contract");

  // 2. Deploy Reputation
  const repWasm = path.resolve(__dirname, "../contracts/reputation/wasm/casperflow_reputation.wasm");
  if (!fs.existsSync(repWasm)) {
     console.log("Building Reputation Odra contract...");
     require("child_process").execSync("cargo odra build", { cwd: path.resolve(__dirname, "../contracts/reputation"), stdio: 'inherit' });
  }

  const repArgs = RuntimeArgs.fromMap({
    casperflow_contract: CLValueBuilder.key(
      new CLValueBuilder.byteArray(Buffer.from(cfHash.replace("contract-", ""), "hex"))
    )
  });
  
  const repHash = await deployContract(repWasm, repArgs, 150_000_000_000, keys, "Deploying Reputation Contract");

  // 3. Mint Reputation NFT
  const mintArgs = RuntimeArgs.fromMap({
    agent_address: CLValueBuilder.key(keys.publicKey)
  });
  await callEntryPoint(repHash, "mint", mintArgs, 3_000_000_000, keys, "Minting Reputation NFT to Agent");

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`CASPERFLOW_CONTRACT_HASH=${cfHash}`);
  console.log(`REPUTATION_CONTRACT_HASH=${repHash}`);
}

main().catch(console.error);
