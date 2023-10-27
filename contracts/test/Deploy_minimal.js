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
    console.log("using deployer: " +deployer);

    //deploy
    console.log("--- use live prisma ---")
    let prisma = await PrismaToken.at(contractList.prisma.prisma);
    let prismaLocker = await TokenLocker.at(contractList.prisma.prismaLocker);
    let vault = await PrismaVault.at(contractList.prisma.vault);
    let incentiveVoting = await IncentiveVoting.at(contractList.prisma.incentiveVoting);
    let adminVoting = await AdminVoting.at(contractList.prisma.adminVoting);
    
    // let airdrop = await AirdropDistributor.new(prisma.address, prismaLocker.address, addressZero,{from:deployer,gasPrice:0} );
    // contractList.prisma.airdrop = airdrop.address;
    // console.log("airdrop: " +airdrop.address);

    console.log("\n-- deploy convex --\n");
    let voteproxy = await PrismaVoterProxy.new(prisma.address, prismaLocker.address,{from:deployer});
    contractList.system.voteProxy = voteproxy.address;
    console.log("voteproxy: " +voteproxy.address);

    let cvxPrisma = await cvxPrismaToken.new(voteproxy.address, {from:deployer});
    contractList.system.cvxPrisma = cvxPrisma.address;
    console.log("cvxPrisma: " +cvxPrisma.address);

    let depositor = await PrismaDepositor.new(voteproxy.address, cvxPrisma.address, prisma.address, prismaLocker.address, {from:deployer});
    contractList.system.depositor = depositor.address;
    console.log("depositor: " +depositor.address);

    let burner = await Burner.new(cvxPrisma.address, {from:deployer});
    contractList.system.burner = burner.address;
    console.log("burner: " +burner.address);

    let booster = await Booster.new(voteproxy.address, depositor.address, prismaLocker.address, vault.address, adminVoting.address, incentiveVoting.address, prisma.address, cvxPrisma.address, {from:deployer});
    contractList.system.booster = booster.address;
    console.log("booster: " +booster.address);

    let staking = await cvxPrismaStaking.new(voteproxy.address, prisma.address, cvxPrisma.address, depositor.address, {from:deployer});
    contractList.system.cvxPrismaStaking = staking.address;
    console.log("cvxPrismaStaking: " +staking.address);

    let stakingFeeReceiver = await FeeReceiverCvxPrisma.new(prisma.address, staking.address, {from:deployer});
    contractList.system.stakingFeeReceiver = stakingFeeReceiver.address;
    console.log("stakingFeeReceiver: " +stakingFeeReceiver.address);

    let feeDeposit = await FeeDepositV2.new(voteproxy.address, prisma.address, cvxPrisma.address, stakingFeeReceiver.address, {from:deployer});
    contractList.system.feeDeposit = feeDeposit.address;
    console.log("feeDeposit: " +feeDeposit.address);

    let receiverVault = await ProxyVault.new(prismaLocker.address, voteproxy.address, addressZero, {from:deployer});
    contractList.system.receiverVault = receiverVault.address;
    console.log("receiverVault: " +receiverVault.address);

    let feeClaimer = await FeeClaimer.new(receiverVault.address, prisma.address, feeDeposit.address, {from:deployer});
    contractList.system.feeClaimer = feeClaimer.address;
    console.log("feeClaimer: " +feeClaimer.address);

    // let dropMinter = await DropMinter.new(cvxPrisma.address, airdrop.address, prismaLocker.address, {from:deployer});
    // contractList.system.dropMinter = dropMinter.address;
    // console.log("dropMinter: " +dropMinter.address);

    let boostDelegate = await BoostDelegate.new(voteproxy.address, cvxPrisma.address, 2000, {from:deployer});
    contractList.system.boostDelegate = boostDelegate.address;
    console.log("boostDelegate: " +boostDelegate.address);

    let utility = await Utilities.new(voteproxy.address, prismaLocker.address, staking.address, {from:deployer});
    contractList.system.utility = utility.address;
    console.log("utility: " +utility.address);
    
    jsonfile.writeFileSync("./contracts.json", contractList, { spaces: 4 });

    console.log("\n-- setup --\n");

    await voteproxy.setDepositor(depositor.address,{from:deployer});
    await voteproxy.setOperator(booster.address,{from:deployer});
    await booster.setTokenMinter(depositor.address, true, {from:deployer});
    await booster.setTokenMinter(burner.address, true, {from:deployer});
    // await booster.setTokenMinter(dropMinter.address, true, {from:deployer});
    await feeDeposit.setFeeClaimer(feeClaimer.address,{from:deployer});
    await booster.setFeeQueue(receiverVault.address, false, feeClaimer.address, {from:deployer});
    await booster.setVoteManager(multisig, {from:deployer});
    console.log("set initial settings")

    await booster.prismaVault().then(a=>console.log("set fees to pvault: " +a))
    await booster.setBoosterFees(true,2000,boostDelegate.address,{from:deployer});
    console.log("set booster fees");

    await staking.addReward(prisma.address, stakingFeeReceiver.address, {from:deployer});
    await staking.addReward(cvx.address, stakingFeeReceiver.address, {from:deployer});
    console.log("staking rewards set")


  });
});


