// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const IERC20 = artifacts.require("IERC20");
const IPoolFactory = artifacts.require("IPoolFactory");


// -- for new ganache
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

contract("Deploy contracts", async accounts => {
  it("should deploy contracts", async () => {

    let deployer = contractList.system.deployer;
    let multisig = contractList.system.multisig;
    let addressZero = "0x0000000000000000000000000000000000000000"

    await unlockAccount(deployer);
    
    let factory = await IPoolFactory.at("0x742C3cF9Af45f91B109a81EfEaf11535ECDe9571");

    var tokens = [
      "0xdA47862a83dac0c112BA89c6abC2159b95afd71C",
      "0x34635280737b5BFe6c7DC2FC3065D60d66e78185",
      addressZero,
      addressZero
      ];
    await factory.deploy_plain_pool("cvxPrisma/Prisma","cvxprismlp", tokens, 25, 15000000, 3, 4, 2597 ,{from:deployer});
    console.log("deployed from " +deployer);

    return;
  });
});


