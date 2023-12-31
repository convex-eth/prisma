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

    //deploy
    // let prisma = await PrismaToken.at(contractList.prisma.prisma);
    // let prismaLocker = await TokenLocker.at(contractList.prisma.prismaLocker);
    // let vault = await PrismaVault.at(contractList.prisma.vault);
    // let incentiveVoting = await IncentiveVoting.at(contractList.prisma.incentiveVoting);
    // let adminVoting = await AdminVoting.at(contractList.prisma.adminVoting);
    // await unlockAccount(vault.address);
    // await prisma.mintToVault(web3.utils.toWei("100000000.0", "ether"),{from:vault.address,gasPrice:0})
    console.log("-- deploy prisma --");
    let prisma = await PrismaToken.new({from:deployer,gasPrice:0});
    contractList.prisma.prisma = prisma.address;
    console.log("prisma: " +prisma.address);

    await prisma.setOperators(deployer,{from:deployer});
    await prisma.mint(userA, web3.utils.toWei("1000000.0", "ether"),{from:deployer});
    await prisma.balanceOf(userA).then(a=>console.log("balance on userA: " +a))

    var addresProvider = addressZero;

    let prismaLocker = await TokenLocker.new(addresProvider, prisma.address, addressZero, "100000000000000000",{from:deployer,gasPrice:0});
    contractList.prisma.prismaLocker = prismaLocker.address;
    console.log("prismaLocker: " +prismaLocker.address);

    await prisma.setLocker(prismaLocker.address,{from:deployer});
    console.log("locker set on prisma token")

    let airdrop = await AirdropDistributor.new(prisma.address, prismaLocker.address, addressZero,{from:deployer,gasPrice:0} );
    contractList.prisma.airdrop = airdrop.address;
    console.log("airdrop: " +airdrop.address);
    await prisma.mint(airdrop.address, web3.utils.toWei("1000000.0", "ether"),{from:deployer});
    await prisma.balanceOf(airdrop.address).then(a=>console.log("balance on airdrop: " +a))

    let vault = await PrismaVault.new(prisma.address, prismaLocker.address, {from:deployer,gasPrice:0})
    contractList.prisma.vault = vault.address;
    console.log("vault: " +vault.address);
    await prisma.mint(vault.address, web3.utils.toWei("10000000.0", "ether"),{from:deployer});

    // let incentiveVote = await IncentiveVoting.new(addresProvider, addressZero, vault.address, {from:deployer});


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

    let booster = await Booster.new(voteproxy.address, depositor.address, prismaLocker.address, vault.address, addressZero, addressZero, prisma.address, cvxPrisma.address, {from:deployer});
    contractList.system.booster = booster.address;
    console.log("booster: " +booster.address);

    let staking = await cvxPrismaStaking.new(voteproxy.address, prisma.address, cvxPrisma.address, depositor.address, {from:deployer});
    contractList.system.cvxPrismaStaking = staking.address;
    console.log("cvxPrismaStaking: " +staking.address);

    let stakingFeeReceiver = await FeeReceiverCvxPrisma.new(prisma.address, staking.address, {from:deployer});
    contractList.system.stakingFeeReceiver = stakingFeeReceiver.address;
    console.log("stakingFeeReceiver: " +stakingFeeReceiver.address);

    let feeQueue = await FeeDepositV2.new(voteproxy.address, prisma.address, cvxPrisma.address, stakingFeeReceiver.address, {from:deployer});
    contractList.system.feeQueue = feeQueue.address;
    console.log("feeQueue: " +feeQueue.address);

    let receiverVault = await ProxyVault.new(prismaLocker.address, voteproxy.address, addressZero, {from:deployer});
    contractList.system.receiverVault = receiverVault.address;
    console.log("receiverVault: " +receiverVault.address);

    let feeClaimer = await FeeClaimer.new(receiverVault.address, prisma.address, feeQueue.address, {from:deployer});
    contractList.system.feeClaimer = feeClaimer.address;
    console.log("feeClaimer: " +feeClaimer.address);

    let dropMinter = await DropMinter.new(cvxPrisma.address, airdrop.address, prismaLocker.address, {from:deployer});
    contractList.system.dropMinter = dropMinter.address;
    console.log("dropMinter: " +dropMinter.address);

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
    await booster.setTokenMinter(dropMinter.address, true, {from:deployer});
    await feeQueue.setFeeClaimer(feeClaimer.address,{from:deployer});
    await booster.setFeeQueue(receiverVault.address, false, feeClaimer.address, {from:deployer});
    console.log("set operators")

    await booster.prismaVault().then(a=>console.log("set fees to pvault: " +a))
    await booster.setBoosterFees(true,2000,boostDelegate.address,{from:deployer});
    console.log("set booster fees");

    await staking.addReward(prisma.address, stakingFeeReceiver.address, {from:deployer});
    await staking.addReward(cvx.address, stakingFeeReceiver.address, {from:deployer});
    console.log("staking rewards set")

    let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    await cvxdistro.setWeight(stakingFeeReceiver.address, 100, {from:deployer});
    await cvxdistro.setWeight(contractList.system.treasury, 6650, {from:deployer});
    console.log("cvx emissions set");

    await booster.setAirdropMinter(airdrop.address, dropMinter.address, {from:deployer});
    console.log("airdrop minter set")

    console.log("\n-- initial lock --\n");
    await unlockAccount(vault.address);
    await prisma.transfer(userA, web3.utils.toWei("1000000.0", "ether"),{from:vault.address,gasPrice:0});
    await prisma.balanceOf(userA).then(a=>console.log("balance on userA: " +a))
    await prisma.transfer(voteproxy.address, web3.utils.toWei("100.0", "ether"),{from:userA});
    // await prisma.transfer(voteproxy.address, "100" ,{from:userA});
    console.log("transfered")
    await depositor.initialLock({from:deployer});
    console.log("initialLock");
    // await prismaLocker.accountLockData(voteproxy.address).then(a=>console.log("lock data: " +JSON.stringify(a)))
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))

    await prisma.balanceOf(userA).then(a=>console.log("prisma balance: " +a))
    await cvxPrisma.balanceOf(userA).then(a=>console.log("cvxprisma balance: " +a))
    await prisma.approve(depositor.address,web3.utils.toWei("1000000000000.0", "ether"),{from:userA});
    console.log("approved to depositor")
    await depositor.deposit(web3.utils.toWei("1000.0", "ether"),true,{from:userA});
    // await depositor.deposit("1000",true,{from:userA});
    console.log("deposited")
    await prisma.balanceOf(userA).then(a=>console.log("prisma balance: " +a))
    await cvxPrisma.balanceOf(userA).then(a=>console.log("cvxprisma balance: " +a))
    // await prismaLocker.accountLockData(voteproxy.address).then(a=>console.log("lock data: " +JSON.stringify(a)))
    await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))

    
    console.log("\n-- test ownership --");
    await cvxPrisma.owner().then(a=>console.log("cvxprisma owner: " +a))
    await unlockAccount(voteproxy.address)
    await cvxPrisma.revokeOwnership({from:voteproxy.address,gasPrice:0});
    await cvxPrisma.owner().then(a=>console.log("cvxprisma owner: " +a))
    await booster.setTokenMinter(deployer, true, {from:deployer}).catch(a=>console.log("revert set operators: " +a));

    console.log("\n-- start rewards ---");

    await advanceTime(day*5);
    await prisma.transfer(stakingFeeReceiver.address, web3.utils.toWei("1000.0", "ether"),{from:userA});
    await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    await cvx.balanceOf(staking.address).then(a=>console.log("cvx balance of staking: " +a));
    await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));

    await stakingFeeReceiver.processFees();
    console.log("processFees()");

    await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    await cvx.balanceOf(staking.address).then(a=>console.log("cvx balance of staking: " +a));
    await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));

    // console.log("\n-- stake ---");
    // await prisma.approve(staking.address,web3.utils.toWei("1000000000000.0", "ether"),{from:userA});
    // await cvxPrisma.approve(staking.address,web3.utils.toWei("1000000000000.0", "ether"),{from:userA});
    // await staking.deposit(web3.utils.toWei("1000.0", "ether"),true,{from:userA});
    // console.log("user A deposit staking")
    // await prismaLocker.getAccountBalances(voteproxy.address).then(a=>console.log("getAccountBalances: " +a.locked))
    // await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    // await staking.stake(web3.utils.toWei("1000.0", "ether"),{from:userA});
    // console.log("user B stake stating")
    // await staking.balanceOf(userA).then(a=>console.log("staking balance: " +a));
    // await staking.claimableRewards(userA).then(a=>console.log("claimable rewards: " +JSON.stringify(a)));
    // await advanceTime(day*5);
    // await staking.claimableRewards(userA).then(a=>console.log("claimable rewards: " +JSON.stringify(a)));
    // await prisma.balanceOf(userA).then(a=>console.log("prisma balance of user: " +a))
    // await cvx.balanceOf(userA).then(a=>console.log("cvx balance of user: " +a))
    // await staking.getReward(userA);
    // console.log("getReward()")
    // await staking.claimableRewards(userA).then(a=>console.log("claimable rewards: " +JSON.stringify(a)));
    // await prisma.balanceOf(userA).then(a=>console.log("prisma balance of user: " +a))
    // await cvx.balanceOf(userA).then(a=>console.log("cvx balance of user: " +a))


    console.log("\n-- airdrop ---");
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await prismaLocker.getAccountBalances(userB).then(a=>console.log("getAccountBalances userB: " +a.locked))
    await cvxPrisma.balanceOf(userB).then(a=>console.log("cvxPrisma balance of userB: " +a));
    await airdrop.claim(userB, userB, 1, 500, [], {from:userB} );
    console.log("claim airdrop to self")
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await prismaLocker.getAccountBalances(userB).then(a=>console.log("getAccountBalances userB: " +a.locked))
    await cvxPrisma.balanceOf(userB).then(a=>console.log("cvxPrisma balance of userB: " +a));
    await airdrop.claim(userB, voteproxy.address, 1, 500, [], {from:userB} );
    console.log("claim airdrop to convex")
    await utility.lockedPrisma().then(a=>console.log("lockedPrisma: " +a))
    await prismaLocker.getAccountBalances(userB).then(a=>console.log("getAccountBalances userB: " +a.locked))
    await cvxPrisma.balanceOf(userB).then(a=>console.log("cvxPrisma balance of userB: " +a));



    console.log("\n-- boost fee claim ---");

    await vault.testaddStoredPending(voteproxy.address, web3.utils.toWei("1000.0", "ether"));
    await vault.claimableBoostDelegationFees(voteproxy.address).then(a=>console.log("claimable fees: " +a));
    await booster.feeQueue().then(a=>console.log("booster feeQueue: " +a))
    console.log("receiverVault: " +receiverVault.address);
    await prismaLocker.getAccountBalances(receiverVault.address).then(a=>console.log("getAccountBalances receiverVault: " +a.locked))
    await prisma.balanceOf(receiverVault.address).then(a=>console.log("prisma balance of receiverVault: " +a));
    await booster.claimFees();
    console.log("fees claimed");
    await vault.claimableBoostDelegationFees(voteproxy.address).then(a=>console.log("claimable fees: " +a));
    await prismaLocker.getAccountBalances(receiverVault.address).then(a=>console.log("getAccountBalances receiverVault: " +a.locked))
    await prisma.balanceOf(receiverVault.address).then(a=>console.log("prisma balance of receiverVault: " +a));

    console.log("\n-- distribute boost revenue ---");

    await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    await prisma.balanceOf(contractList.system.treasury).then(a=>console.log("prisma balance of treasury: " +a));
    await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));

    await feeQueue.processFees({from:deployer});
    console.log("feeQueue processFees()");

    await prisma.balanceOf(staking.address).then(a=>console.log("prisma balance of staking: " +a));
    await prisma.balanceOf(contractList.system.treasury).then(a=>console.log("prisma balance of treasury: " +a));
    await utility.stakingRewardRates().then(a=>console.log("staking rewards: " +JSON.stringify(a)));



  });
});


