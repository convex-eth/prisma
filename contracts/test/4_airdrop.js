const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');


const PrismaToken = artifacts.require("PrismaToken");
const TokenLocker = artifacts.require("TokenLocker");
const PrismaVault = artifacts.require("PrismaVault");
const SystemStart = artifacts.require("SystemStart");
const IncentiveVoting = artifacts.require("IncentiveVoting");
const AdminVoting = artifacts.require("AdminVoting");
const AirdropDistributor = artifacts.require("AirdropDistributor");



const PrismaVoterProxy = artifacts.require("PrismaVoterProxy");
const PrismaDepositor = artifacts.require("PrismaDepositor");
const FeeReceiverCvxPrisma = artifacts.require("FeeReceiverCvxPrisma");
const FeeDepositV2 = artifacts.require("FeeDepositV2");
const cvxPrismaStaking = artifacts.require("cvxPrismaStaking");
const cvxPrismaToken = artifacts.require("cvxPrismaToken");
const Utilities = artifacts.require("Utilities");
const Burner = artifacts.require("Burner");
const DropMinter = artifacts.require("DropMinter");
const ProxyVault = artifacts.require("ProxyVault");
const FeeClaimer = artifacts.require("FeeClaimer");
const BoostDelegate = artifacts.require("BoostDelegate");
const VestingClaim = artifacts.require("VestingClaim");
const IPrismaVesting = artifacts.require("IPrismaVesting");

const Booster = artifacts.require("Booster");
const ICvxDistribution = artifacts.require("ICvxDistribution");


const IERC20 = artifacts.require("IERC20");


const addAccount = async (address) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_addAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const unlockAccount = async (address) => {
  let NETWORK = config.network;
  if(!NETWORK.includes("debug")){
    return null;
  }
  await addAccount(address);
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "personal_unlockAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const send = payload => {
  if (!payload.jsonrpc) payload.jsonrpc = '2.0';
  if (!payload.id) payload.id = new Date().getTime();

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(payload, (error, result) => {
      if (error) return reject(error);

      return resolve(result);
    });
  });
};

/**
 *  Mines a single block in Ganache (evm_mine is non-standard)
 */
const mineBlock = () => send({ method: 'evm_mine' });

/**
 *  Gets the time of the last block.
 */
const currentTime = async () => {
  const { timestamp } = await web3.eth.getBlock('latest');
  return timestamp;
};

/**
 *  Increases the time in the EVM.
 *  @param seconds Number of seconds to increase the time by
 */
const fastForward = async seconds => {
  // It's handy to be able to be able to pass big numbers in as we can just
  // query them from the contract, then send them back. If not changed to
  // a number, this causes much larger fast forwards than expected without error.
  if (BN.isBN(seconds)) seconds = seconds.toNumber();

  // And same with strings.
  if (typeof seconds === 'string') seconds = parseFloat(seconds);

  await send({
    method: 'evm_increaseTime',
    params: [seconds],
  });

  await mineBlock();
};

contract("prisma airdrop claim and mint", async accounts => {
  it("should successfully run", async () => {
    
    let deployer = contractList.system.deployer;
    let multisig = contractList.system.multisig;
    let addressZero = "0x0000000000000000000000000000000000000000"

    let cvx = await IERC20.at(contractList.system.cvx);
    

    let userA = accounts[0];
    let userB = accounts[1];
    let userC = accounts[2];
    let userD = accounts[3];
    let userZ = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
    var userNames = {};
    userNames[userA] = "A";
    userNames[userB] = "B";
    userNames[userC] = "C";
    userNames[userD] = "D";
    userNames[userZ] = "Z";

    const advanceTime = async (secondsElaspse) => {
      await time.increase(secondsElaspse);
      await time.advanceBlock();
      console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    }
    const day = 86400;
    await unlockAccount(deployer);
    await unlockAccount(multisig);

    //deploy
    let prisma = await PrismaToken.at(contractList.prisma.prisma);
    let prismaLocker = await TokenLocker.at(contractList.prisma.prismaLocker);
    let vault = await PrismaVault.at(contractList.prisma.vault);
    let incentiveVoting = await IncentiveVoting.at(contractList.prisma.incentiveVoting);
    let adminVoting = await AdminVoting.at(contractList.prisma.adminVoting);
    

    let voteproxy = await PrismaVoterProxy.at(contractList.system.voteProxy);
    let cvxPrisma = await cvxPrismaToken.at(contractList.system.cvxPrisma)

    let depositor = await PrismaDepositor.at(contractList.system.depositor)

    let burner = await Burner.at(contractList.system.burner)

    let booster = await Booster.at(contractList.system.booster)

    let staking = await cvxPrismaStaking.at(contractList.system.cvxPrismaStaking)

    let stakingFeeReceiver = await FeeReceiverCvxPrisma.at(contractList.system.stakingFeeReceiver)

    let feeDeposit = await FeeDepositV2.at(contractList.system.feeDeposit)

    let receiverVault = await ProxyVault.at(contractList.system.receiverVault);

    let feeClaimer = await FeeClaimer.at(contractList.system.feeClaimer)

    let utility = await Utilities.at(contractList.system.utility);
    

    //set merkle root
    let airdrop = await AirdropDistributor.at(contractList.prisma.airdrop_vecrv);

    let airowner = "0xD0eFDF01DD8d650bBA8992E2c42D0bC6d441a673";
    await unlockAccount(airowner);
    await airdrop.setMerkleRoot("0xc32e0ea56d946a34e25ed9677e00f99b87a19c128d44e657e3841aae9ba803b8",{from:airowner,gasPrice:0});
    console.log("merkle set");

    //return;


    //test claim
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await cvxPrisma.balanceOf(userZ).then(a=>console.log("uzer z cvxprisma: " +a))
    
    
    await unlockAccount(userZ);
    let proof = [
      "0x5455a89e0eb9ba83107b077aad7570ed5932a2ea360eefa72d5f87b7efbe5d38",
        "0x3ccfa9e16f22ce405ce84afd7839a2bce236dd9b66f0c43f93054138c93bdf4e",
        "0x8f193234197195cef19dc75d52e83dbcdcebd7d828178d7d93a152f2e0169065",
        "0x4b116abe7a368d98757af115a8100b8413ecdb9f8f359c3bcbb696455f98b314",
        "0x8ed12728202201d93373bfde8a04a421b0dc8849af17294c01346c8fe7064b8d",
        "0x003aa7122ae76d3c843d2bfb89d326b512c85d6fbe273936d63c274947fe350a",
        "0xf069da4019fcd3eb8294e5da238557c9e51b621f7882bce22f39ac3e03e83dfa",
        "0xb0e6b565c63222fd442d5261e8e1ef8f332679011bff2f980e75623db3d73fcd",
        "0xd29f99ce3be65aec95cb181b3c31290d79ddc8da6f1ab0e84253f68695de5e3a",
        "0x40330dd3fc367f97ea97a78fbd213bc88cc795076297ebfe3d8d33ec5c29e791",
        "0xf56a846322cf77b1ab31ebfd32ce693f22dbd314ba7db276f4aabf8a06df7bf1"
      ]
    let amount = "141449";
    let index = 1275;
    await airdrop.claim(userZ, voteproxy.address, index, amount, proof, {from:userZ});
    console.log("claimed");

    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await cvxPrisma.balanceOf(userZ).then(a=>console.log("uzer z cvxprisma: " +a))

  });
});


