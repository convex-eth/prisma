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
const BoostFeeClaimer = artifacts.require("BoostFeeClaimer");
const PlatformFeeClaimer = artifacts.require("PlatformFeeClaimer");
const BoostDelegate = artifacts.require("BoostDelegate");
const IBooster = artifacts.require("IBooster");

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
    let convexMainDeployer = contractList.system.convexMainDeployer;
    await unlockAccount(convexMainDeployer);
    await unlockAccount(deployer);
    await unlockAccount(multisig);

    //get deployments
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

    let stakingFeeReceiver = await FeeReceiverCvxPrisma.at(contractList.system.stakingFeeReceiver_booster)

    let boostfeeDeposit = await FeeDepositV2.at(contractList.system.feeDeposit_booster)

    let receiverVault = await ProxyVault.at(contractList.system.receiverVault);

    let boostfeeClaimer = await BoostFeeClaimer.at(contractList.system.feeClaimer_booster)

    // let dropMinter = await DropMinter.at(contractList.system.);

    let utility = await Utilities.at(contractList.system.utility);

    let boostDelegate = await BoostDelegate.at(contractList.system.boostDelegate);

    let mkusd = await IERC20.at(contractList.prisma.mkusd);



    // let platformFeeStakingReceiver = await FeeReceiverCvxPrisma.new(mkusd.address, staking.address, {from:deployer});
    // console.log("stakingFeeReceiver for platform: " +platformFeeStakingReceiver.address);
    // let platformFeeDeposit = await FeeDepositV2.new(voteproxy.address, mkusd.address, platformFeeStakingReceiver.address, {from:deployer});
    // console.log("platformFeeDeposit: " +platformFeeDeposit.address)
    // let platformFeeClaimer = await PlatformFeeClaimer.new(contractList.prisma.feeDistributor, voteproxy.address, platformFeeDeposit.address, mkusd.address, {from:deployer});
    // console.log("PlatformFeeClaimer: " +platformFeeClaimer.address);
    // var newbooster = await Booster.new(voteproxy.address, depositor.address, prismaLocker.address, vault.address, adminVoting.address, incentiveVoting.address, prisma.address, cvxPrisma.address, {from:deployer});
    // console.log("new booster: " +newbooster.address);
    

    let platformFeeStakingReceiver = await FeeReceiverCvxPrisma.at(contractList.system.stakingFeeReceiver_platform);
    console.log("stakingFeeReceiver for platform: " +platformFeeStakingReceiver.address);
    let platformFeeDeposit = await FeeDepositV2.at(contractList.system.feeDeposit_platform);
    console.log("platformFeeDeposit: " +platformFeeDeposit.address)
    let platformFeeClaimer = await PlatformFeeClaimer.at(contractList.system.feeClaimer_platform);
    console.log("PlatformFeeClaimer: " +platformFeeClaimer.address);
    var newbooster = await Booster.at(contractList.system.newbooster);
    console.log("new booster: " +newbooster.address);

    // /*
    // transactions:
    //   - take ownership of new booster
    //   - shutdown old booster
    //   - set new booster
    //   - call various registrations on new booster: votemanager, feequeue, token sweeper
    //   - delegate PlatformFeeClaimer to claim on prisma fee distro
    //   - set PlatformFeeClaimer as feeclaimer on platform feeDeposit
    //   - set bot as distributor role on fee deposit (does it have role on boost fee deposit too?)
    //   - set main deployer as a distributor too
    //   - add new cvxprisma receiver as a distributor for mkusd and cvx on stakedcvxprisma
    //   - move cvx emissions from old cvxprisma receiver to new (platform fees should be more constant)
    // */

    // //deployer
    // await newbooster.setPendingOwner(multisig,{from:deployer});
    // console.log("pending owner set");

    // await staking.addReward(mkusd.address, platformFeeStakingReceiver.address, {from:deployer});
    // await staking.approveRewardDistributor(cvx.address, platformFeeStakingReceiver.address, true, {from:deployer});
    // console.log("add mkusd to cvxprisma staking and add fee receiver as cvx distributor");

    // return;

    let cvxdistro = await ICvxDistribution.at(contractList.system.cvxDistro);
    await cvxdistro.setWeight(stakingFeeReceiver.address, 0, {from:convexMainDeployer});
    await cvxdistro.setWeight(stakingFeeReceiver.address, 350, {from:convexMainDeployer});


    //msig
    await newbooster.acceptPendingOwner({from:multisig,gasPrice:0});
    console.log("accepted ownership");
    await booster.shutdownSystem({from:multisig,gasPrice:0});
    console.log("booster shutdown")
    await voteproxy.setOperator(newbooster.address,{from:multisig,gasPrice:0});
    await newbooster.setFeeQueue(receiverVault.address, boostfeeClaimer.address, {from:multisig,gasPrice:0});
    await newbooster.setVoteManager(multisig, {from:multisig,gasPrice:0});
    await newbooster.setTokenSweeper(boostDelegate.address, {from:multisig,gasPrice:0});
    console.log("new booster set");

    await newbooster.setDelegateApproval(contractList.prisma.feeDistributor, platformFeeClaimer.address, true, {from:multisig,gasPrice:0});
    console.log("set delegate on prisma fee distro");

    await platformFeeDeposit.setFeeClaimer(platformFeeClaimer.address, {from:multisig,gasPrice:0})
    console.log("platformFeeDeposit.setFeeClaimer done");

    await platformFeeDeposit.setDistributor("0x947B7742C403f20e5FaCcDAc5E092C943E7D0277", true, {from:multisig,gasPrice:0})
    await boostfeeDeposit.setDistributor("0x947B7742C403f20e5FaCcDAc5E092C943E7D0277", true, {from:multisig,gasPrice:0})
    await platformFeeDeposit.setDistributor("0x051C42Ee7A529410a10E5Ec11B9E9b8bA7cbb795", true, {from:multisig,gasPrice:0})
    await boostfeeDeposit.setDistributor("0x051C42Ee7A529410a10E5Ec11B9E9b8bA7cbb795", true, {from:multisig,gasPrice:0})
    console.log("add accounts to fee deposit distributors");

    


    //try claiming
    await advanceTime(7 * day);
    await cvx.balanceOf(staking.address).then(a=>console.log("cvx on staking: " +a));
    await prisma.balanceOf(staking.address).then(a=>console.log("prisma on staking: " +a));
    await mkusd.balanceOf(staking.address).then(a=>console.log("mkusd on staking: " +a));

    await boostfeeDeposit.processFees({from:deployer});
    console.log("\nboost fee deposit processed\n")

    await cvx.balanceOf(staking.address).then(a=>console.log("cvx on staking: " +a));
    await prisma.balanceOf(staking.address).then(a=>console.log("prisma on staking: " +a));
    await mkusd.balanceOf(staking.address).then(a=>console.log("mkusd on staking: " +a));

    await platformFeeDeposit.processFees({from:deployer});
    console.log("\nplatform fee deposit processed\n")

    await cvx.balanceOf(staking.address).then(a=>console.log("cvx on staking: " +a));
    await prisma.balanceOf(staking.address).then(a=>console.log("prisma on staking: " +a));
    await mkusd.balanceOf(staking.address).then(a=>console.log("mkusd on staking: " +a));

  });
});


