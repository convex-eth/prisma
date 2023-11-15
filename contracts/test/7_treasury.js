// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const Booster = artifacts.require("Booster");
const PrismaDepositor = artifacts.require("PrismaDepositor");
const IERC20 = artifacts.require("IERC20");
const TreasuryManager = artifacts.require("TreasuryManager");
const IConvexDeposits = artifacts.require("IConvexDeposits");


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

contract("Test swapping/converting/lping and other actions for treasury", async accounts => {
  it("should test treasury actions", async () => {

    let deployer = contractList.system.deployer;
    let multisig = contractList.system.multisig;
    let addressZero = "0x0000000000000000000000000000000000000000"
    let treasury = contractList.system.treasury;
    

    //system
    let booster = await IConvexDeposits.at("0xF403C135812408BFbE8713b5A23a04b3D48AAE31");
    let prismaDeposit = await PrismaDepositor.at(contractList.system.depositor);
    let cvx = await IERC20.at(contractList.system.cvx);
    let crv = await IERC20.at("0xD533a949740bb3306d119CC777fa900bA034cd52");
    let cvxCrv = await IERC20.at("0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7");
    let cvxprisma = await IERC20.at(contractList.system.cvxPrisma);
    let prisma = await IERC20.at(contractList.prisma.prisma);
    let veprisma = await IERC20.at(contractList.prisma.prismaLocker);
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
      // await time.increase(secondsElaspse);
      // await time.advanceBlock();
      await fastForward(secondsElaspse);
      console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    }
    const day = 86400;

    await unlockAccount(deployer);
    await unlockAccount(multisig);
    await unlockAccount(treasury);

    let manager = await TreasuryManager.new({from:deployer});
    // let manager = await TreasuryManager.at(contractList.system.treasuryManager);
    console.log("manager: " +manager.address)

    var prismaApprove = prisma.contract.methods.approve(manager.address,"115792089237316195423570985008687907853269984665640564039457584007913129639935").encodeABI();
    var cvxprismaApprove = cvxprisma.contract.methods.approve(manager.address,"115792089237316195423570985008687907853269984665640564039457584007913129639935").encodeABI();
    console.log("prisma calldata: " +prismaApprove);
    console.log("cvxprisma calldata: " +cvxprismaApprove);

    // return;


    await unlockAccount(veprisma.address);
    await prisma.transfer(deployer,web3.utils.toWei("10000.0", "ether"),{from:veprisma.address,gasPrice:0})
    await prisma.balanceOf(treasury).then(a=>console.log("treasury balance: " +a));
   
    
    await prisma.approve(manager.address,web3.utils.toWei("100000000000.0", "ether"),{from:treasury,gasPrice:0});
    await cvxprisma.approve(manager.address,web3.utils.toWei("100000000000.0", "ether"),{from:treasury,gasPrice:0});

    // await manager.setSlippageAllowance("995000000000000000",{from:multisig,gasPrice:0});
    // console.log("set slippage")

    console.log("\n\n >>> Swap >>>>\n");
    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));

    var amount = web3.utils.toWei("1.0", "ether");
    console.log("swapping: " +amount);
    await manager.slippage().then(a=>console.log("slippage allowance: " +a))
    var minOut = await manager.calc_minOut_swap(amount);
    console.log("calc out: " +minOut);
    await manager.swap(amount,minOut,{from:deployer});

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));

    console.log("\n\n >>> Swap END>>>>");

    console.log("\n\n >>> Convert >>>>\n");
    
    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));

    var amount = web3.utils.toWei("100.0", "ether");
    console.log("convert amount: " +amount);
    await manager.convert(amount,false,{from:deployer});
    
    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));

    console.log("\n\n >>> Convert END>>>>");

    console.log("\n\n >>> Add LP >>>>");
    
    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));

    var amountprisma = web3.utils.toWei("1.0", "ether");
    var amountcvxprisma = web3.utils.toWei("100.0", "ether");
    console.log("add to LP prisma: " +amountprisma);
    console.log("add to LP cvxprisma: " +amountcvxprisma);

    var minOut = await manager.calc_minOut_deposit(amountprisma,amountcvxprisma);
    console.log("minOut: " +minOut);

    await manager.addToPool(amountprisma, amountcvxprisma, minOut,{from:deployer});

    var lprewards = await IERC20.at(await manager.lprewards());
    console.log("lp rewards at: " +lprewards.address);

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await lprewards.balanceOf(manager.address).then(a=>console.log("staked lp: " +a));

    console.log("\n\n >>> Add LP END>>>>");

    await advanceTime(day);
    await booster.earmarkRewards(159);
    await advanceTime(day);

    console.log("\n\n >>> Remove LP one side >>>>");

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await crv.balanceOf(treasury).then(a=>console.log("treasury crv: " +a));
    await cvx.balanceOf(treasury).then(a=>console.log("treasury cvx: " +a));

    await crv.balanceOf(manager.address).then(a=>console.log("manager crv: " +a));
    await cvxCrv.balanceOf(manager.address).then(a=>console.log("manager cvxCrv: " +a));

    var lpbal = await lprewards.balanceOf(manager.address);
    console.log("remove LP: " +lpbal);
    var minOut = await manager.calc_withdraw_one_coin(lpbal);
    console.log("minOut: " +minOut);

    await manager.removeFromPool(lpbal, minOut,{from:deployer});

    await crv.balanceOf(manager.address).then(a=>console.log("manager crv: " +a));
    await cvxCrv.balanceOf(manager.address).then(a=>console.log("manager cvxCrv: " +a));

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await crv.balanceOf(treasury).then(a=>console.log("treasury crv: " +a));
    await cvx.balanceOf(treasury).then(a=>console.log("treasury cvx: " +a));

    console.log("\n\n >>> Remove LP one side END>>>>");



    console.log("\n\n >>> Add LP 2>>>>");
    
    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));

    var amountprisma = web3.utils.toWei("10.0", "ether");
    var amountcvxprisma = web3.utils.toWei("10.0", "ether");
    console.log("add to LP prisma: " +amountprisma);
    console.log("add to LP cvxprisma: " +amountcvxprisma);

    var minOut = await manager.calc_minOut_deposit(amountprisma,amountcvxprisma);
    console.log("minOut: " +minOut);

    await manager.addToPool(amountprisma, amountcvxprisma, minOut,{from:deployer});

    var lprewards = await IERC20.at(await manager.lprewards());
    console.log("lp rewards at: " +lprewards.address);

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await lprewards.balanceOf(manager.address).then(a=>console.log("staked lp: " +a));

    console.log("\n\n >>> Add LP END 2>>>>");

    await advanceTime(day);
    await booster.earmarkRewards(159);
    await advanceTime(day);

    console.log("\n\n >>> claim rewards >>>>");

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await crv.balanceOf(treasury).then(a=>console.log("treasury crv: " +a));
    await cvx.balanceOf(treasury).then(a=>console.log("treasury cvx: " +a));

    await manager.claimLPRewards({from:deployer});
    console.log("\nclaimed lp rewards\n");

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await crv.balanceOf(treasury).then(a=>console.log("treasury crv: " +a));
    await cvx.balanceOf(treasury).then(a=>console.log("treasury cvx: " +a));

    console.log("\n\n >>>  end claim rewards >>>>");


    await advanceTime(day);
    await booster.earmarkRewards(159);
    await advanceTime(day);

    console.log("\n\n >>> Remove LP >>>>");

    var lptoken = await IERC20.at(await manager.exchange()); //lptoken = pool

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await crv.balanceOf(treasury).then(a=>console.log("treasury crv: " +a));
    await cvx.balanceOf(treasury).then(a=>console.log("treasury cvx: " +a));
    await lptoken.balanceOf(treasury).then(a=>console.log("treasury lptoken: " +a));

    await crv.balanceOf(manager.address).then(a=>console.log("manager crv: " +a));
    await cvxCrv.balanceOf(manager.address).then(a=>console.log("manager cvxCrv: " +a));
    await lptoken.balanceOf(manager.address).then(a=>console.log("manager lptoken: " +a));

    var lpbal = await lprewards.balanceOf(manager.address);
    console.log("remove LP: " +lpbal);
    // var minOut = await manager.calc_withdraw_one_coin(lpbal);
    // console.log("minOut: " +minOut);

    await manager.removeAsLP(lpbal, {from:deployer});
    console.log("removed as lp");

    await prisma.balanceOf(treasury).then(a=>console.log("treasury prisma: " +a));
    await cvxprisma.balanceOf(treasury).then(a=>console.log("treasury cvxprisma: " +a));
    await crv.balanceOf(treasury).then(a=>console.log("treasury crv: " +a));
    await cvx.balanceOf(treasury).then(a=>console.log("treasury cvx: " +a));
    await lptoken.balanceOf(treasury).then(a=>console.log("treasury lptoken: " +a));

    await crv.balanceOf(manager.address).then(a=>console.log("manager crv: " +a));
    await cvxCrv.balanceOf(manager.address).then(a=>console.log("manager cvxCrv: " +a));
    await lptoken.balanceOf(manager.address).then(a=>console.log("manager lptoken: " +a));

    console.log("\n\n >>> Remove LP END>>>>");
  });
});


