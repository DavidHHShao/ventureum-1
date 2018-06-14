pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "../handlers/IContractAddressHandler.sol";
import "../handlers/IACLHandler.sol";
import '../base/Base.sol';


contract Module is Base, Ownable {
    bytes32 constant public PROJECT_CONTROLLER_CI = keccak256("ProjectController");
    bytes32 constant public MILESTONE_CONTROLLER_CI = keccak256("MilestoneController");
    bytes32 constant public TOKEN_SALE_CI = keccak256("TokenSale");
    bytes32 constant public TOKEN_COLLECTOR_CI = keccak256("TokenCollector");
    bytes32 constant public ETHER_COLLECTOR_CI = keccak256("EtherCollector");

    address public storeAddr;

    IACLHandler public aclHandler;
    IContractAddressHandler public contractAddressHandler;

    bytes32 constant public ACL_HANDLER_CI = keccak256("ACLHandler");
    bytes32 constant public CONTRACT_ADDRESS_HANDLER_CI = keccak256("ContractAddressHandler");

    modifier handlerOnly(bytes32 handlerCI) {
        require(msg.sender == kernel.handlers(handlerCI));
        _;
    }

    constructor(address kernelAddr) Base(kernelAddr) public {}

    function setHandler(bytes32 CI, address handlerAddr) public kernelOnly {
        super.setHandler(CI, handlerAddr);

        if (CI == ACL_HANDLER_CI) {
            aclHandler = IACLHandler(handlerAddr);
        }
        if (CI == CONTRACT_ADDRESS_HANDLER_CI) {
            contractAddressHandler = IContractAddressHandler(handlerAddr);
        }
    }

    function setStorage(address _storeAddr) public onlyOwner {
        storeAddr = _storeAddr;
    }

    function validate() internal view {
        super.validate();
        bytes32 srcCI = contractAddressHandler.reverseLookUp(msg.sender);
        require(aclHandler.isAuthorized(srcCI, CI, msg.sig));
    }
}
