const fs = require('fs');
const { ethers } = require("ethers");
const jsonfile = require('jsonfile');
const { PRISMA_VAULT, BOOST_CALCULATOR} = require('./abi');
const getBlockByTime = require('./getBlockByTime')
var BN = ethers.BigNumber;

const config = jsonfile.readFileSync('./config.json');

/*
Get Boost Stats for given address

To use: 
npm i
Create a config.json with necessary keys: USE_PROVIDER, NETWORK, XXX_KEY
node boostStats 0xaddress
node boostStats convex
node boostStats yearn
*/


//Setup ethers providers
var provider;
if (config.USE_PROVIDER == "infura") {
  provider = new ethers.providers.InfuraProvider(config.NETWORK, config.INFURA_KEY);
} else if (config.USE_PROVIDER == "alchemy") {
  provider = new ethers.providers.AlchemyProvider(config.NETWORK, config.ALCHEMY_KEY);
} else {
  provider = new ethers.providers.JsonRpcProvider(config.GETH_NODE, config.NETWORK);
}

const prismaVault = new ethers.Contract("0x06bDF212C290473dCACea9793890C5024c7Eb02c", PRISMA_VAULT, provider);
const boostCalculator = new ethers.Contract("0x31ae4cbfaFB007a908F348Cf95Ce4b535D5A8fa3", BOOST_CALCULATOR, provider);

const convex = "0x8ad7a9e2B3Cd9214f36Cb871336d8ab34DdFdD5b";
const yearn = "0x90be6DFEa8C80c184C442a36e17cB2439AAE25a7";

const week = 604800 * 1000;


const getBoostStats = async (address, useBlock) => {

    // if(week == 0){
    var week = await prismaVault.getWeek({ blockTag: useBlock });
    // }
    var total_weekly = await prismaVault.weeklyEmissions(week,{ blockTag: useBlock });

    var initial = await boostCalculator.getClaimableWithBoost(address, 0, total_weekly,{ blockTag: useBlock })
    var current = await prismaVault.getClaimableWithBoost(address,{ blockTag: useBlock })

    var max_total = BN.from(initial[0]) / 1e18
    var used = (BN.from(initial[0]).add(BN.from(initial[1]))).sub( (BN.from(current[0]).add(BN.from(current[1]))))
    used /= 1e18;

    var percent = (used / max_total) * 100;

    var remainingMax = BN.from(current[0]) / 1e18;
    var remainingTotal = BN.from(current[1]) / 1e18;
    var initalremainingMax = BN.from(initial[0]) / 1e18;
    var initialremainingTotal = BN.from(initial[1]) / 1e18;

    var total_used = (initalremainingMax + initialremainingTotal ) - remainingMax - remainingTotal;

    var current_boost = ((remainingTotal/initialremainingTotal)+1.0);

    var fees = await prismaVault.claimableBoostDelegationFees(address,{ blockTag: useBlock });
    fees = BN.from(fees) / 1e18;

    total_weekly /= 1e18;
    console.log("\n")
    console.log("Current Week: " +week);
    console.log("Account: " +address);
    console.log("Total Emissions: " +Number(total_weekly.toFixed(2)).toLocaleString());
    console.log("Max Boostable: " +Number(max_total.toFixed(2)).toLocaleString());
    console.log("Total Claimed: " +Number(used.toFixed(2)).toLocaleString() +" ("+percent.toFixed(2) +"%)");
    console.log("Current Boost: " +Number(current_boost.toFixed(2)).toLocaleString() +"x");
    console.log("Claimable Fees: " +Number(fees.toFixed(2)).toLocaleString());
    console.log("\n")
}


const main = async () => {

    const cmdArgs = process.argv.slice(2);
    var address = cmdArgs[0];
    var useweek = Number.isInteger(Number(cmdArgs[1])) ? Number(cmdArgs[1]) : 0;
    if(address.toLowerCase() == "convex"){
        address = convex;
    }
    if(address.toLowerCase() == "yearn"){
        address = yearn;
    }
    var timestamp = new Date().getTime()
    timestamp = Math.floor( timestamp / week);
    timestamp = timestamp * week
    var prismaweek = Number(await prismaVault.getWeek());
    var useBlock = await provider.getBlockNumber();
    if(useweek < prismaweek){
        var adjustweeks = (prismaweek - useweek) - 1;
        timestamp = timestamp - (adjustweeks * week) - 100000;
        // console.log("get block by timestamp: " +timestamp)
        var block = await getBlockByTime(provider,timestamp/1000);
        useBlock = block.number;
    }
    // console.log("using block: "+useBlock);
    await getBoostStats(address, useBlock);
}

main();