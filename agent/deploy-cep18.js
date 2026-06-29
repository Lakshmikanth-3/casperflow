const fs = require("fs");
const path = require("path");
const { CasperClient, Keys, DeployUtil, RuntimeArgs, CLValueBuilder, CLByteArray } = require("casper-js-sdk");

const NODE_URL = "https://node.testnet.cspr.cloud/rpc";
const CHAIN_NAME = "casper-test";
const apiKey = "019f07e7-0e80-7565-96dc-d97ed29a8064";

// Custom client to inject API key
class MyCasperClient extends CasperClient {
  constructor(url) {
    super(url);
    const originalRequest = this.nodeClient.client.request.bind(this.nodeClient.client);
    this.nodeClient.client.request = async (method, params) => {
      const axios = require('axios');
      const res = await axios.post(url, {
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      }, { headers: { 'Authorization': apiKey } });
      if (res.data.error) throw new Error(res.data.error.message);
      return res.data.result;
    };
  }
}

const client = new MyCasperClient(NODE_URL);

async function main() {
  const agentKeyPath = path.resolve(__dirname, "../keys/agent_secret_key.pem");
  const keyPair = Keys.Ed25519.loadKeyPairFromPrivateFile(agentKeyPath);
  console.log(`Deployer Wallet: ${keyPair.publicKey.toHex()}`);
  
  const wasmPath = path.resolve(__dirname, "cep18.wasm");
  const wasmBytes = new Uint8Array(fs.readFileSync(wasmPath));
  
  const args = RuntimeArgs.fromMap({
    name: CLValueBuilder.string('SpectralToken'),
    symbol: CLValueBuilder.string('SPT'),
    decimals: CLValueBuilder.u8(9),
    total_supply: CLValueBuilder.u256("1000000000000000"),
  });
  
  const session = DeployUtil.ExecutableDeployItem.newModuleBytes(wasmBytes, args);
  const payment = DeployUtil.standardPayment(200_000_000_000);
  
  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(
      keyPair.publicKey,
      CHAIN_NAME,
      1,
      3_600_000,
      [],
      Date.now()
    ),
    session,
    payment
  );
  
  const signedDeploy = DeployUtil.signDeploy(deploy, keyPair);
  try {
    const deployHash = await client.putDeploy(signedDeploy);
    console.log('Deploy hash:', deployHash);
  } catch (e) {
    console.error("Deploy failed:", e);
  }
}

main().catch(console.error);
