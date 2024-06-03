const fs = require('fs');
const { ethers } = require("ethers");
const jsonfile = require('jsonfile');
const { CRV_ABI, MASTERCHEF_ABI, UNITVAULT_ABI, MULTICALL_ABI, REWARDS_ABI, MASTERCHEFVTWO_ABI, GAUGE_ABI } = require('./abi');
var BN = require('big-number');

const config = jsonfile.readFileSync('./config.json');

const cvxprismaholders_file = 'cvxprisma_holders.json';
const cvxprismafinal_file = 'cvxprisma_final.json';


//Setup ethers providers
// const provider = new ethers.providers.InfuraProvider(config.NETWORK, config.INFURA_KEY);
const provider = new ethers.providers.AlchemyProvider (config.NETWORK, config.ALCHEMY_KEY);
//const provider = new ethers.providers.JsonRpcProvider(config.GETH_NODE, config.NETWORK);

const convexCurve = "0x989AEb4d175e16225E39E87d0D97A3360524AD80";
const cvxprismaAddress = '0x34635280737b5BFe6c7DC2FC3065D60d66e78185';
const stkcvxprismaAddress = '0x0c73f1cFd5C9dFc150C8707Aa47Acbd14F0BE108';



const multicallContract = new ethers.Contract("0x5e227AD1969Ea493B43F840cfF78d08a6fc17796", MULTICALL_ABI, provider);
const multicallInstance = multicallContract.connect(provider);


var cvxprismaHolders = {
    addresses: {}
};

var redirects = {
    "0xD60cd4AD7A2D6bF4eC9fccbCAeec769b52726dfd":"0xa3C5A1e09150B75ff251c1a7815A07182c3de2FB", //treasury
    "0x1389388d01708118b497f59521f6943Be2541bb7":"0xa3C5A1e09150B75ff251c1a7815A07182c3de2FB", //treasury
}



function compare( a, b ) {
  return b.num._compare(a.num);
}

function combine(a,b){
    //combine
    var combined = {};
    for (var i in a) {
        combined[i] = a[i];
    }
    for (var i in b) {
        if(combined[i] == undefined){
            combined[i] = b[i];
        }else{
            //add
            var increase = new BN(b[i]);
            var final = new BN(combined[i]).add(increase);
            combined[i] = final.toString();
        }
    }
    return combined;
}

function formatToDecimals(data) {
    var arr = []
    for (var i in data) {
        arr.push({address:i,num:new BN(data[i])})
    }
    var formatted = {};
    for(var i in arr){
        var amount = arr[i].num.toString()

        amount = amount.padStart(19,"0");
        amount = [Number(amount.substring(0,amount.length-18)).toLocaleString(), ".", amount.substring(amount.length-18)].join('');
        amount = amount.replace(/(\.[0-9]*[1-9])0+$|\.0*$/,'$1')

        formatted[arr[i].address] = amount
    }
    return formatted;
}

function formatRemoveDecimals(data) {
    var formatted = {};
    for (var i in data) {
        var numstr = data[i].replace(",","");
        var decimals = numstr.substring(numstr.indexOf(".")).padEnd(19,"0").substring(1);
        numstr = numstr.substring(0,numstr.indexOf(".")).replace(/^0+/, '');
        formatted[i] = numstr+decimals;
    }
    return formatted;
}

const getBalances = async (token, userAddresses, snapshotBlock) => {
    let querySize = 30;
    let iface = new ethers.utils.Interface(CRV_ABI)
    var balances = {};

    var addressArray = [];
    for (var i in userAddresses) {
        addressArray.push(i);
    }
   // console.log(addressArray);
    console.log("address length: " +addressArray.length);
    var groups = Number( (addressArray.length/querySize) + 1).toFixed(0);
    console.log("address groups: " +groups);
    await Promise.all([...Array(Number(groups)).keys()].map(async i => {
        var start = i*querySize;
        var finish = i*querySize + querySize - 1;
        if(finish >= addressArray.length){
            finish = addressArray.length - 1;
        }
        console.log("get balances from " + start + " to " +finish);
        var calldata = [];
        var addresses = [];
        for(var c = start; c <= finish; c++){
            // console.log("queuery for " +addressArray[c]);
            var enc = iface.encodeFunctionData("balanceOf(address)",[addressArray[c]]);
            calldata.push([token,enc]);
            addresses.push(addressArray[c]);
        }
        //console.log(calldata);
        let returnData = await multicallInstance.aggregate(calldata, { blockTag: snapshotBlock });
        var balData = returnData[1];
        //console.log(returnData);
        for(var d = 0; d < balData.length; d++){
            // if(balData[d] == "0x")continue;
            // console.log("baldata[d]: " +balData[d]);
            var bal = ethers.BigNumber.from(balData[d]);
            if(bal > 0){
                balances[addresses[d]] = bal.toString();
            }
        }
    }));
    return balances; 
}

const getPoolHolders = async (snapshotBlock, startBlock, lpaddress, pooladdress, gauge, rewardAddress, prismaStakingAddress) => {
    console.log("Getting lp holders");
    var logCount = 15000;
    var holders = {};

    var contract = new ethers.Contract(lpaddress, CRV_ABI, provider);
    var instance = contract.connect(provider);

    //get holders
    for (var i = startBlock; i <= snapshotBlock;) {
        var logs = await instance.queryFilter(instance.filters.Transfer(), i, i + logCount)
        var progress = ((i - startBlock) / (snapshotBlock - startBlock)) * 100;
        console.log('Current Block: ' + i + ' Progress: ' + progress.toFixed(2) + '%');
        for (var x = 0; x < logs.length; x++) {
            //log("log: " +JSON.stringify(logs[x].args));
            var from = logs[x].args[0];
            var to = logs[x].args[1];
            var pool = logs[x].args[1].toString();

            if(to == gauge) continue;
            if(to == "0x0000000000000000000000000000000000000000") continue;

            //log("cvxprisma transfor to: " +to);
            holders[to] = "0";
        }
        if (i==snapshotBlock) {
            break;
        }
        i = i + logCount;
        if (i > snapshotBlock) {
            i = snapshotBlock;
        }
    }

    var contract = new ethers.Contract(rewardAddress, REWARDS_ABI, provider);
    var instance = contract.connect(provider);
    //get stakers. cant look at transfer since you can use stakeFor()
    for (var i = startBlock; i <= snapshotBlock;) {
        var logs = await instance.queryFilter(instance.filters.Staked(), i, i + logCount)
        var progress = ((i - startBlock) / (snapshotBlock - startBlock)) * 100;
        console.log('Current Block: ' + i + ' Progress: ' + progress.toFixed(2) + '%');
        for (var x = 0; x < logs.length; x++) {
            //log("log: " +JSON.stringify(logs[x].args));
            var from = logs[x].args[0];

            if(to == prismaStakingAddress) continue;
            if(to == "0x0000000000000000000000000000000000000000") continue;

            holders[from] = "0";
        }
        if (i==snapshotBlock) {
            break;
        }
        i = i + logCount;
        if (i > snapshotBlock) {
            i = snapshotBlock;
        }
    }

    var contract = new ethers.Contract(prismaStakingAddress, CRV_ABI, provider);
    var instance = contract.connect(provider);
    //get holders
    for (var i = startBlock; i <= snapshotBlock;) {
        var logs = await instance.queryFilter(instance.filters.Transfer(), i, i + logCount)
        var progress = ((i - startBlock) / (snapshotBlock - startBlock)) * 100;
        console.log('Current Block: ' + i + ' Progress: ' + progress.toFixed(2) + '%');
        for (var x = 0; x < logs.length; x++) {
            //log("log: " +JSON.stringify(logs[x].args));
            var from = logs[x].args[0];
            var to = logs[x].args[1];
            var pool = logs[x].args[1].toString();

            if(to == gauge) continue;
            if(to == "0x0000000000000000000000000000000000000000") continue;

            //log("cvxprisma transfor to: " +to);
            holders[to] = "0";
        }
        if (i==snapshotBlock) {
            break;
        }
        i = i + logCount;
        if (i > snapshotBlock) {
            i = snapshotBlock;
        }
    }

    delete holders[gauge];
    delete holders[rewardAddress];
    delete holders[prismaStakingAddress];
    console.log("getting vanilla lp balances...");
    var plain = await getBalances(lpaddress,holders,snapshotBlock );
    console.log("getting staked convex lp balances...");
    var stakers = await getBalances(rewardAddress,holders,snapshotBlock );
    console.log("getting staked prisma lp balances...");
    var prismastakers = await getBalances(prismaStakingAddress,holders,snapshotBlock );

    holders = combine(combine(plain,stakers),prismastakers);
    
    var totallp = new BN(0);
    for (var i in holders) {
        var lpbalance = new BN(holders[i]);
        totallp = totallp.add(lpbalance);
    }
    console.log("lp token total: " +totallp.toString());
    
    const cvxprismaContract = new ethers.Contract(cvxprismaAddress, CRV_ABI, provider);

    //get amount of cvxprisma on lp
    var lpcvxprisma = await cvxprismaContract.balanceOf(pooladdress, { blockTag: snapshotBlock });
    console.log("cvxprisma on lp: "+lpcvxprisma.toString())
   
    //convert
    var convertratio = new BN(lpcvxprisma.toString()).multiply(1e18).div(totallp);
    console.log("convertratio: " +convertratio.toString())

    var balanceCheck = BN(0);
    for (var i in holders) {
        var cvxprismabalance = new BN(convertratio).multiply(new BN(holders[i])).div(1e18);
        balanceCheck.add(cvxprismabalance);
        holders[i] = cvxprismabalance.toString();
    }
    console.log("final cvxprisma balance for all LPers (should be close to balanceOf above (rounding)): " +balanceCheck.toString());

    return holders;
}



const getcvxprismaHolders = async (snapshotBlock) => {
	console.log("Getting cvxprisma holders");
    const cvxprismaContract = new ethers.Contract(cvxprismaAddress, CRV_ABI, provider);
    const cvxprismaInstance = cvxprismaContract.connect(provider);
    var logCount = 15000;
    var startBlock = 18441544;
    var holders = {};
    //get holders
    for (var i = startBlock; i <= snapshotBlock;) {
        var logs = await cvxprismaInstance.queryFilter(cvxprismaInstance.filters.Transfer(), i, i + logCount)
        var progress = ((i - startBlock) / (snapshotBlock - startBlock)) * 100;
        console.log('Current Block: ' + i + ' Progress: ' + progress.toFixed(2) + '%');
        for (var x = 0; x < logs.length; x++) {
        	//log("log: " +JSON.stringify(logs[x].args));
            var from = logs[x].args[0];
            var to = logs[x].args[1];
            var pool = logs[x].args[1].toString();

            // if(to == stakeAddress) continue;
            if(to == "0x0000000000000000000000000000000000000000") continue;

            //log("cvxprisma transfor to: " +to);
            holders[to] = "0";
        }
        if (i==snapshotBlock) {
            break;
        }
        i = i + logCount;
        if (i > snapshotBlock) {
            i = snapshotBlock;
        }
    }
    
    delete holders["0x0000000000000000000000000000000000000000"];

    holders = await getBalances(cvxprismaAddress,holders,snapshotBlock );
    return holders;
}

const getcvxprismaStakers = async (snapshotBlock) => {
    console.log("Getting cvxprisma stakers");
    var cvxprismaContract = new ethers.Contract(stkcvxprismaAddress, CRV_ABI, provider);
    var instance = cvxprismaContract.connect(provider);
    var logCount = 15000;
    var startBlock = 18441544;
    var holders = {};
    //get holders
    for (var i = startBlock; i <= snapshotBlock;) {
        var logs = await instance.queryFilter(instance.filters.Transfer(), i, i + logCount)
        var progress = ((i - startBlock) / (snapshotBlock - startBlock)) * 100;
        console.log('Current Block: ' + i + ' Progress: ' + progress.toFixed(2) + '%');
        for (var x = 0; x < logs.length; x++) {
            //log("log: " +JSON.stringify(logs[x].args));
            var from = logs[x].args[0];
            var to = logs[x].args[1];
            var pool = logs[x].args[1].toString();

            // if(to == stakeAddress) continue;
            if(to == "0x0000000000000000000000000000000000000000") continue;

            // console.log("cvxprisma transfor to: " +to);
            holders[to] = "0";
        }
        if (i==snapshotBlock) {
            break;
        }
        i = i + logCount;
        if (i > snapshotBlock) {
            i = snapshotBlock;
        }
    }
    
    delete holders["0x0000000000000000000000000000000000000000"];
    holders = await getBalances(stkcvxprismaAddress,holders,snapshotBlock );
    return holders;
}


const main = async () => {
    // var snapshotBlock = await provider.getBlockNumber();
    var snapshotBlock = 19969603;
    console.log('snapshotBlock block:' + snapshotBlock)

 	//// cvxprisma holders/stakers
 	var holders = await getcvxprismaHolders(snapshotBlock);
    var stakers = await getcvxprismaStakers(snapshotBlock);

    //startblock, lptoken, gauge, convex reward
    var lpblock = 18517157;
    var lppool = "0x3b21C2868B6028CfB38Ff86127eF22E68d16d53B";
    var lptoken = "0x3b21C2868B6028CfB38Ff86127eF22E68d16d53B";
    var lpgauge = "0x13E58C7b1147385D735a06D14F0456E54C2dEBC8";
    var lpconvex = "0x4b10c7fAd37cB7A9DaCcEeEe40C0d97549918298";
    var lpprisma = "0xd91fBa4919b7BF3B757320ea48bA102F543dE341";
    var lpers = await getPoolHolders(snapshotBlock,lpblock, lptoken, lppool, lpgauge, lpconvex, lpprisma);

    cvxprismaHolders.addresses = combine(combine(holders,stakers),lpers);
    delete cvxprismaHolders.addresses[lppool]; //lppool
    delete cvxprismaHolders.addresses["0x0c73f1cFd5C9dFc150C8707Aa47Acbd14F0BE108"]; //staked cvxprisma

    var totalHeldcvxprisma = BN(0);
    for (var i in cvxprismaHolders.addresses) {
        totalHeldcvxprisma.add(new BN(cvxprismaHolders.addresses[i]));
    }
    console.log("total held: " +totalHeldcvxprisma.toString());

    //redirects
    var rkeys = Object.keys(redirects);
    console.log("redirects...");
    for(var i=0; i < rkeys.length; i++){
        var from = rkeys[i];
        var to = redirects[from];
        if(cvxprismaHolders.addresses[from] != undefined){
            console.log("redirect from " +from +"  to  " +to +" amount: "+cvxprismaHolders.addresses[from]);
            if(cvxprismaHolders.addresses[to] == undefined){
                cvxprismaHolders.addresses[to] = cvxprismaHolders.addresses[from];
            }else{
                //add
                var balance = new BN(cvxprismaHolders.addresses[to]).add(new BN(cvxprismaHolders.addresses[from]));
                cvxprismaHolders.addresses[to] = balance.toString();
            }
        }else{
            console.log(from +" does not have cvxprisma");
        }
        //remove old
        delete cvxprismaHolders.addresses[from];
    }


    ////// **** begin external vaults etc from other protocols **** //////

    //Currently adding in user info given to us by each protocol's team
    //In the future this could be nice to calculate via this script but for now
    //just importing a json file

    //airforce
    var airforce = jsonfile.readFileSync("./airforce_cvxprisma_" +snapshotBlock +".json");
    var airTotal = BN(0);
    for (var i in airforce) {
        airTotal.add(new BN(airforce[i]));
    }
    console.log("airforce total: " +airTotal.toString());
    delete cvxprismaHolders.addresses["0x88011c72623777f6452a7d6D8Bab10Ec67e89e01"]; //airforce vault
    cvxprismaHolders.addresses = combine(cvxprismaHolders.addresses,airforce);

    ////// **** end external vaults etc from other protocols **** //////
    
    var totalcvxprisma = BN(0);
    for (var i in cvxprismaHolders.addresses) {
        totalcvxprisma.add(new BN(cvxprismaHolders.addresses[i]));
    }
    console.log("total cvxprisma: " +totalcvxprisma.toString());

    cvxprismaHolders.blockHeight = snapshotBlock;
    cvxprismaHolders.totalcvxprisma = totalcvxprisma.toString();

    //sort
    var arr = []
    for (var i in cvxprismaHolders.addresses) {
        arr.push({address:i,num:new BN(cvxprismaHolders.addresses[i])})
    }
    arr.sort(compare);
    cvxprismaHolders.addresses = {};
    for(var i in arr){
        var amount = arr[i].num.toString()
        cvxprismaHolders.addresses[arr[i].address] = amount;
    }

	jsonfile.writeFileSync(cvxprismafinal_file, cvxprismaHolders, { spaces: 4 });
}

main();