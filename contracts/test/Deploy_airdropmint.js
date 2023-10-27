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

contract("prisma deploy and lock testing", async accounts => {
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
    let convexMainDeployer = contractList.system.convexMainDeployer;
    await unlockAccount(convexMainDeployer);
    console.log("using deployer: " +deployer);

    //deploy
    console.log("--- use live prisma ---")    
    let airdrop = await AirdropDistributor.at(contractList.prisma.airdrop);
    console.log("airdrop: " +airdrop.address);

    console.log("\n-- deploy convex --\n");

    let dropMinter = await DropMinter.new(contractList.system.cvxPrisma, airdrop.address, contractList.prisma.prismaLocker, {from:deployer});
    contractList.system.dropMinter = dropMinter.address;
    console.log("dropMinter: " +dropMinter.address);
    
    jsonfile.writeFileSync("./contracts.json", contractList, { spaces: 4 });

    console.log("\n-- setup --\n");

    await booster.setTokenMinter(dropMinter.address, true, {from:deployer});
    console.log("add drop minter")

    await booster.setAirdropMinter(airdrop.address, dropMinter.address, {from:deployer});
    console.log("airdrop minter set")


    // let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    // await cvxdistro.setWeight(stakingFeeReceiver.address, 100, {from:convexMainDeployer});
    // await cvxdistro.setWeight(contractList.system.treasury, 6650, {from:convexMainDeployer});
    // console.log("cvx emissions set");

  });
});


