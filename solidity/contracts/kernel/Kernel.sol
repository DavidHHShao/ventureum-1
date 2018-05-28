pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./IKernel.sol";
import "./IBase.sol";
import "../handlers/IHandler.sol";

contract Kernel is IKernel, Ownable {

    // CI => Handler address
    mapping(bytes32 => address) public handlers;

    bytes32[] public handlerList;

    function registerHandler(bytes32 CI, address handlerAddr) external onlyOwner {
        require(handlers[CI] == address(0x0));
        handlers[CI] = handlerAddr;
        handlerList.push(CI);
    }

    function unregisterHandler(bytes32 CI) external onlyOwner {
        require(handlers[CI] != address(0x0));
        delete handlers[CI];
        for(uint i = 0; i < handlerList.length; i++) {
            if (handlerList[i] == CI) {
                handlerList[i] = handlerList[handlerList.length - 1];
                delete handlerList[handlerList.length - 1];
                handlerList.length--;
            }
        }
    }

    function verifyHandler(bytes32[] _handlerList) internal {
        for(uint i = 0; i < _handlerList.length; i++) {
            address handlerAddr = handlers[_handlerList[i]];
            require(handlerAddr != address(0x0));
            require(IHandler(handlerAddr).isConnected());
        }
    }

    function connect(address contractAddr, bytes32[] _handlerList) external onlyOwner {
        verifyHandler(_handlerList);
        IBase(contractAddr).connect();
        for(uint i = 0; i < _handlerList.length; i++) {
            IBase(contractAddr).setHandler(_handlerList[i], handlers[_handlerList[i]]);
        }
    }

    function disconnect(address contractAddr, bytes32[] _handlerList) external onlyOwner {
        verifyHandler(_handlerList);
        for(uint i = 0; i < _handlerList.length; i++) {
            IBase(contractAddr).setHandler(_handlerList[i], address(0x0));
        }
        IBase(contractAddr).disconnect();
    }
}
