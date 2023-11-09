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

    // let dropMinter = await DropMinter.at(contractList.system.);

    let utility = await Utilities.at(contractList.system.utility);


    

    let oldboostDelegate = await BoostDelegate.at(contractList.system.boostDelegate);
    console.log("old boost delegate: " +oldboostDelegate.address);
    let boostDelegate = await BoostDelegate.new(voteproxy.address, cvxPrisma.address, 1000);
    console.log("boostDelegate: " +boostDelegate.address);

    
    await booster.setBoosterFees(true,65535,boostDelegate.address,{from:deployer});
    await booster.setTokenMinter(oldboostDelegate.address, false, {from:deployer});
    await booster.setTokenMinter(boostDelegate.address, true, {from:deployer});
    await booster.setTokenSweeper(boostDelegate.address, {from:deployer});
    console.log("set booster fee/delegate");

    return;

    await vault.claimableRewardAfterBoost(userZ, userZ, addressZero, "0xf69282a7e7ba5428f92f610e7afa1c0cedc4e483").then(a=>console.log("self claimable: " +JSON.stringify(a) +"\namount: " +a.adjustedAmount +"\nfees: " +a.feeToDelegate));
    await vault.claimableRewardAfterBoost(userZ, voteproxy.address, voteproxy.address, "0xf69282a7e7ba5428f92f610e7afa1c0cedc4e483").then(a=>console.log("convex claimable: " +JSON.stringify(a) +"\namount: " +a.adjustedAmount+"\nfees: " +a.feeToDelegate));
    
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await cvxPrisma.balanceOf(userZ).then(a=>console.log("uzer z cvxprisma: " +a))
    
    await crv.balanceOf(contractList.system.voteProxy).then(a=>console.log("crv on proxy: " +a))
    await crv.balanceOf(userZ).then(a=>console.log("crv on user: " +a))
    await cvx.balanceOf(contractList.system.voteProxy).then(a=>console.log("cvx on proxy: " +a))
    await cvx.balanceOf(userZ).then(a=>console.log("cvx on user: " +a))

    await unlockAccount(userZ);
    // await oldboostDelegate.delegatedBoostCallback(userZ,voteproxy.address,0,web3.utils.toWei("100.0", "ether"),0,0,0).catch(a=>console.log("revert not vault: " +a));
    await vault.batchClaimRewards(voteproxy.address, voteproxy.address, ["0xf69282a7e7ba5428f92f610e7afa1c0cedc4e483","0x0Ae09f649e9dA1b6aEA0c10527aC4e8a88a37480"], 10000, {from:userZ});
    console.log("claimed");

    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await cvxPrisma.balanceOf(userZ).then(a=>console.log("uzer z cvxprisma: " +a))

    await crv.balanceOf(contractList.system.voteProxy).then(a=>console.log("crv on proxy: " +a))
    await crv.balanceOf(userZ).then(a=>console.log("crv on user: " +a))
    await cvx.balanceOf(contractList.system.voteProxy).then(a=>console.log("cvx on proxy: " +a))
    await cvx.balanceOf(userZ).then(a=>console.log("cvx on user: " +a))

  });
});


