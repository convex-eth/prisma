
/**
 * Find nearest block to given timestamp, expect timestamp in seconds
 */
module.exports = async (provider, targetTimestamp) => {
  
  let averageBlockTime = 12

  // get current block number
  const currentBlockNumber = await provider.getBlockNumber();
  var block = await provider.getBlock(currentBlockNumber);
  // console.log("currentBlockNumber: " +currentBlockNumber);
  // console.log("block: " +JSON.stringify(block));
  // console.log("block.timestamp: " +block.timestamp);
  // console.log("target: " +targetTimestamp);

  let requestsMade = 0

  let blockNumber = currentBlockNumber
  // console.log("target diff: " +Math.abs(block.timestamp - targetTimestamp))
  while( Math.abs(block.timestamp - targetTimestamp) > 50){
    var changeBlocks = 0;
    changeBlocks = (block.timestamp - targetTimestamp) / averageBlockTime
    changeBlocks = parseInt(changeBlocks)

    if( Math.abs(changeBlocks) < 1){
      break
    }

    blockNumber -= changeBlocks
    // console.log("changeBlocks: " +changeBlocks);

    block = await provider.getBlock(blockNumber);
    // console.log("blockNumber: " +blockNumber);
    // console.log("block.timestamp: " +block.timestamp);
    requestsMade += 1
    // console.log("target diff: " +Math.abs(block.timestamp - targetTimestamp))
  }

  //TODO: after searching for a block within 50 seconds, check blocks one at a time to get the most precise block

  // console.log( "tgt timestamp   ->", targetTimestamp)
  // console.log( "" )

  // console.log( "block timestamp ->", block.timestamp)
  // console.log( "" )

  // console.log( "block number ->", blockNumber)
  // console.log( "" )

  // console.log( "requests made   ->", requestsMade)

  return block
}