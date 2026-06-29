const axios = require('axios');

async function testRPC() {
  console.log("Testing Casper RPC connection bypassing blocked domains...");
  
  // Use CSPR.cloud which resolves properly on your network
  const url = 'https://node.testnet.cspr.cloud/rpc';
  const apiKey = '019f07e7-0e80-7565-96dc-d97ed29a8064';

  try {
    const response = await axios.post(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'info_get_status'
      },
      { headers: { 'Authorization': apiKey } }
    );
    
    console.log("✅ SUCCESS! Connected to Casper Testnet!");
    console.log("Current Block Height:", response.data.result.last_added_block_info.height);
    console.log("Casper Version:", response.data.result.api_version);
    
  } catch (err) {
    console.error("❌ FAILED:", err.message);
  }
}

testRPC();
