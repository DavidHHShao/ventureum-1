pragma solidity ^0.4.24;

import "../storage/Storage.sol";


contract ProjectControllerStorage is Storage {
    constructor (address kernelAddr) Storage(kernelAddr) public {
        CI = keccak256("ProjectControllerStorage");
    }
}
