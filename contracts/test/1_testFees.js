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

    //deploy
    let prisma = await PrismaToken.at(contractList.prisma.prisma);
    let prismaLocker = await TokenLocker.at(contractList.prisma.prismaLocker);
    let vault = await PrismaVault.at(contractList.prisma.vault);
    let incentiveVoting = await IncentiveVoting.at(contractList.prisma.incentiveVoting);
    let adminVoting = await AdminVoting.at(contractList.prisma.adminVoting);

    await unlockAccount(vault.address);
    await prisma.mintToVault(web3.utils.toWei("100000000.0", "ether"),{from:vault.address,gasPrice:0})


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

    let boostDelegate = await BoostDelegate.at(contractList.system.boostDelegate);

    let utility = await Utilities.at(contractList.system.utility);
    

    console.log("\n-- setup --\n");



    let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    await cvxdistro.setWeight(stakingFeeReceiver.address, 100, {from:convexMainDeployer});
    await cvxdistro.setWeight(contractList.system.treasury, 6650, {from:convexMainDeployer});
    console.log("cvx emissions set");

    // await booster.setAirdropMinter(airdrop.address, dropMinter.address, {from:deployer});
    // console.log("airdrop minter set")

    console.log("\n-- initial lock --\n");
    await unlockAccount(vault.address);
    await prisma.transfer(userA, web3.utils.toWei("1000000.0", "ether"),{from:vault.address,gasPrice:0});
    await prisma.balanceOf(userA).then(a=>console.log("balance on userA: " +a))
    
    // await prismaLocker.lock(voteproxy.address, "100", 52, {from:userA});
    // console.log("locked before inital")
    // await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    // await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))

    await prisma.approve(depositor.address,web3.utils.toWei("1000000000000.0", "ether"),{from:userA});
    console.log("approved to depositor")
    await depositor.deposit(web3.utils.toWei("1000.0", "ether"),true,{from:userA});
    console.log("deposited before inital")
    await prisma.balanceOf(userA).then(a=>console.log("prisma balance: " +a))
    await cvxPrisma.balanceOf(userA).then(a=>console.log("cvxprisma balance: " +a))
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))

    await prisma.transfer(voteproxy.address, web3.utils.toWei("100.0", "ether"),{from:userA});
    console.log("transfered tokens to voteproxy")
    await depositor.initialLock({from:deployer});
    console.log("initialLock");
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))

    await prisma.balanceOf(userA).then(a=>console.log("prisma balance: " +a))
    await cvxPrisma.balanceOf(userA).then(a=>console.log("cvxprisma balance: " +a))
    await prisma.approve(depositor.address,web3.utils.toWei("1000000000000.0", "ether"),{from:userA});
    console.log("approved to depositor")
    await depositor.deposit(web3.utils.toWei("1000.0", "ether"),true,{from:userA});
    console.log("deposited")
    await prisma.balanceOf(userA).then(a=>console.log("prisma balance: " +a))
    await cvxPrisma.balanceOf(userA).then(a=>console.log("cvxprisma balance: " +a))
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))

    
    // console.log("\n-- test ownership --");
    // await cvxPrisma.owner().then(a=>console.log("cvxprisma owner: " +a))
    // await unlockAccount(voteproxy.address)
    // await cvxPrisma.revokeOwnership({from:voteproxy.address,gasPrice:0});
    // await cvxPrisma.owner().then(a=>console.log("cvxprisma owner: " +a))
    // await booster.setTokenMinter(deployer, true, {from:deployer}).catch(a=>console.log("revert set operators: " +a));

    // console.log("\n-- start rewards ---");

    // await advanceTime(day*5);
    // await prisma.transfer(stakingFeeReceiver.address, web3.utils.toWei("1000.0", "ether"),{from:userA});
    // await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    // await cvx.balanceOf(staking.address).then(a=>console.log("cvx balance of staking: " +a));
    // await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));

    // await stakingFeeReceiver.processFees();
    // console.log("processFees()");

    // await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    // await cvx.balanceOf(staking.address).then(a=>console.log("cvx balance of staking: " +a));
    // await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));



    // console.log("\n-- airdrop ---");
    // await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    // await prismaLocker.getAccountBalances(userB).then(a=>console.log("getAccountBalances userB: " +a.locked))
    // await cvxPrisma.balanceOf(userB).then(a=>console.log("cvxPrisma balance of userB: " +a));
    // await airdrop.claim(userB, userB, 1, 500, [], {from:userB} );
    // console.log("claim airdrop to self")
    // await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    // await prismaLocker.getAccountBalances(userB).then(a=>console.log("getAccountBalances userB: " +a.locked))
    // await cvxPrisma.balanceOf(userB).then(a=>console.log("cvxPrisma balance of userB: " +a));
    // await airdrop.claim(userB, voteproxy.address, 1, 500, [], {from:userB} );
    // console.log("claim airdrop to convex")
    // await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    // await prismaLocker.getAccountBalances(userB).then(a=>console.log("getAccountBalances userB: " +a.locked))
    // await cvxPrisma.balanceOf(userB).then(a=>console.log("cvxPrisma balance of userB: " +a));



    // console.log("\n-- boost fee claim ---");

    // await vault.testaddStoredPending(voteproxy.address, web3.utils.toWei("1000.0", "ether"));
    // await vault.claimableBoostDelegationFees(voteproxy.address).then(a=>console.log("claimable fees: " +a));
    // await booster.feeQueue().then(a=>console.log("booster feeQueue: " +a))
    // console.log("receiverVault: " +receiverVault.address);
    // await prismaLocker.getAccountBalances(receiverVault.address).then(a=>console.log("getAccountBalances receiverVault: " +a.locked))
    // await prisma.balanceOf(receiverVault.address).then(a=>console.log("prisma balance of receiverVault: " +a));
    // await booster.claimFees();
    // console.log("fees claimed");
    // await vault.claimableBoostDelegationFees(voteproxy.address).then(a=>console.log("claimable fees: " +a));
    // await prismaLocker.getAccountBalances(receiverVault.address).then(a=>console.log("getAccountBalances receiverVault: " +a.locked))
    // await prisma.balanceOf(receiverVault.address).then(a=>console.log("prisma balance of receiverVault: " +a));

    // console.log("\n-- distribute boost revenue ---");

    // await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    // await prisma.balanceOf(contractList.system.treasury).then(a=>console.log("prisma balance of treasury: " +a));
    // await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));

    // await feeQueue.processFees({from:deployer});
    // console.log("feeQueue processFees()");

    // await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    // await prisma.balanceOf(contractList.system.treasury).then(a=>console.log("prisma balance of treasury: " +a));
    // await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));



  });
});


