// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract PrismaToken is ERC20{// is OFT, IERC2612 {
    address public owner;
    mapping(address => bool) public operators;
    address public locker;

    constructor()
        ERC20(
            "Prisma Token",
            "Prisma"
        )
    {
        owner = msg.sender;
    }

   function setOperators(address _depositor) external {
        require(msg.sender == owner, "!auth");
        operators[_depositor] = true;
        owner = address(0); //immutable once set
    }

    function setLocker(address _locker) external{
        require(locker == address(0), "!auth");
        locker = _locker;
    }

    function mintToVault(uint256 _totalSupply) external returns (bool){
        
    }

    function transferToLocker(address _from, uint256 _amount) external returns (bool){
        require(msg.sender == locker, "!locker");
        _transfer(_from, locker, _amount);
        return true;
    }
    
    function mint(address _to, uint256 _amount) external {
        require(operators[msg.sender], "!authorized");
        
        _mint(_to, _amount);
    }

    function burn(address _from, uint256 _amount) external {
        require(operators[msg.sender], "!authorized");
        
        _burn(_from, _amount);
    }

}
