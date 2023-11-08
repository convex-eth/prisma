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
    let airdropbase = await AirdropDistributor.at(contractList.prisma.airdrop_base_vecrv);
    let airdrop = await AirdropDistributor.at(contractList.prisma.airdrop_vecrv);

    // let airbaseowner = "0xD0eFDF01DD8d650bBA8992E2c42D0bC6d441a673";
    // let airowner = "0xd8531a94100f15af7521a7B6E724aC4959E0A025";
    // await unlockAccount(airbaseowner);
    // await unlockAccount(airowner);
    // await airdropbase.setMerkleRoot("0xa353d0271199c6c617d696e89e96654f2c9081881e5f8efc497aba0ac95e7cea",{from:airbaseowner,gasPrice:0});
    // await airdrop.setMerkleRoot("0xadd4b434427e8e5c69350b0b9dcc1766106372ccf72a1b691d54376da5edf15b",{from:airowner,gasPrice:0});
    // console.log("merkle set");

    //return;


    //test claim
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await cvxPrisma.balanceOf(userZ).then(a=>console.log("uzer z cvxprisma: " +a))
    
    
    await unlockAccount(userZ);
    let proofA = [
      "0x718c66f9e8ae7cf2fddb57c43a9beb16f929a69a671da83ae83f53772e9f7156",
      "0xe696a831f435db5a6db6a5e8d995dbd6ec8793a51614b75d67dfa93c668a87f9",
      "0xeb1b2a9584707c8a07ea4c3ed9677147360b60aaeaf6efc61f56927f720d2785",
      "0x9aebda894e02d718448b32a6426fe5a1745da54bfb8e1481daa2aa5f25d233c4",
      "0x5b153f4f60e78253bbcd4ed04d71191222fe4a8ffd8d93ef6944c984216ea0a9",
      "0xfafeeaf8c1b38b91752aa391c37af921fb217deedfc38c6cc905387ac40f5e00",
      "0x8bb2683491f1bf03cb9f6bd636cbc82293d956db5c6ddfd0c3546774a76a861e",
      "0xa5c62b021b8c9534404777ff79921ac57578898fa571c92c776c6186c2bdb6e6",
      "0xe06b37dd3e00c3c4482e729c378be9f6ff8a2a5fe3e1835f8563c50d7c09bee8",
      "0xe652303524e77a0e1598c0b9babe5eec8533f9d5f9317dbdc81ab590250cba4c",
      "0xc4bb8313c0e45a2ad6d41e6c469e112d246a439767ff714aa3cc6acda74a2185",
      "0xcc6ab941e7cccce2eea965bb4b36dc3a432fa1c2c0e5cb905032bf08ac59c395"
      ];
    let proofB = [
      "0xd0505c5250d4425352f81c3eecd3cba02f3c0198ba7f07615780df66422268fa",
      "0xcf72ad694defa13fd33c10be953228e857fe3b8a99223c293849c0be2312fb6f",
      "0x14699f4cfb9251c09df1f4de0128c38cb64445835e302c62255e3695f2e05440",
      "0xbfa0f3b4789e0f00a04323f73d8eed3d3c327c057cf1a2c3196a4c0022a8247c",
      "0xd960ecc30dbe0881779bd4fe2aed7d631b1059849af021d81b33497e4680bf44",
      "0xa220498a47c2979b90e206753c4828ad4b5c97004d147448b583b9bb8f404752",
      "0xd0d04ee1767257db3a481b1277b88b1ed39808a25000f22383fc831622afc8e3",
      "0x97a8f05b5db3e477e8ddb25026fb85c847d2e03609ed64ff896f1a2fdbf47ab7",
      "0x18efabfcc6630852074c48aae6e5694e89ecdafe3de7bf7cfb0183b016a63c3c",
      "0x1f891d76c8350ab2d2ec341c92d1b58d17961c553b8aed3970cfcf603af13e6e",
      "0x76218ed175009dba1f9ca5bd7d99337bc49075e33e28177144512f0293cc3387",
      "0x8baf6fd0ae63a8f385a34d5620d223183a04aa8373ae17fb0fd0863d5cbab391"
    ];
    var proofs = [proofA,proofB];
    let amount = "141350";
    let index = 1648;
    await airdrop.claim(userZ, voteproxy.address, index, amount, proofs, {from:userZ});
    console.log("claimed");

    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await cvxPrisma.balanceOf(userZ).then(a=>console.log("uzer z cvxprisma: " +a))

  });
});


