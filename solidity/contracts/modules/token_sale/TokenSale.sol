pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

import "../Module.sol";
import "../token_collector/TokenCollector.sol";
import "../project_controller/ProjectController.sol";


contract TokenSale is Module {
    using SafeMath for uint;

    // events
    event _StartTokenSale (
        address indexed sender,
        bytes32 indexed namespace,
        uint rate,
        address token
    );

    event _BuyTokens (
        address indexed sender,
        bytes32 indexed namespace,
        uint tokenNum,
        uint ethNum
    );

    event _Finalized (address indexed sender, bytes32 indexed namespace);

    address constant NULL = address(0x0);

    struct TokenInfo {
        bytes32 namespace;
        uint rate;
        ERC20 token;
        uint totalTokenSold;
        uint totalEth;
        bool finalized;
    }

    mapping(bytes32 => TokenInfo) public infoPoll;

    ProjectController public projectController;

    modifier founderOnly(bytes32 namespace) {
        require(projectController != NULL);
        require(projectController.verifyOwner(namespace, msg.sender));
        _;
    }

    constructor (address kernelAddr) Module(kernelAddr) public {
        CI = keccak256("TokenSale");
    }

    function setProjectController(address _projectController) 
        external
        connected
    {
        require (_projectController != NULL);
        projectController = ProjectController(_projectController);
    }

    /**
     * Start a token sale after application has been accepted
     *
     * @param namespace namespace of the project
     * @param rate (uint) of token sale
     * @param token address of the project token
     */
    function startTokenSale(bytes32 namespace, uint rate, address token) 
        external
        founderOnly(namespace)
    {
        require(projectController != NULL);

        require(!tokenInfoExist(namespace));
        (bool existing, uint state) = projectController.getProjectInfo(namespace);
        require(existing);
        require(state == uint(ProjectController.ProjectState.AppAccepted));

        TokenInfo memory info = TokenInfo({
            namespace: namespace,
            rate: rate,
            token: ERC20(token),
            totalTokenSold: 0,
            totalEth: 0,
            finalized: false
        });

        infoPoll[namespace] = info;

        projectController.setState(namespace, uint(ProjectController.ProjectState.TokenSale));

        emit _StartTokenSale(msg.sender, namespace, rate, token);
    }

    /**
     * Finalize a token sale, investors can not call buyTokens
     * after a sale has been finalized
     *
     * Calculate the token sale average price, and write it to storage
     *
     * @param namespace namespace of the project
     */
    function finalize(bytes32 namespace) external founderOnly(namespace) {
        require(tokenInfoExist(namespace) && infoPoll[namespace].finalized == false);

        infoPoll[namespace].finalized = true;

        emit _Finalized(msg.sender, namespace);
    }

    /**
     * Return token info if this token sale info exist.
     *
     * @param namespace namespace of the project
     */
    function tokenInfo(bytes32 namespace) external view returns (uint, uint, uint, bool) {
        require(tokenInfoExist(namespace));
        return (
        infoPoll[namespace].rate,
        infoPoll[namespace].totalTokenSold,
        infoPoll[namespace].totalEth,
        infoPoll[namespace].finalized
        );
    }

    /**
     * Return the average price of a token sale
     *
     * @param namespace namespace of the project
     * @return 0 if token sale has not been finalzied or does not
     * exist, otherwise returns the average price
     */
    function avgPrice(bytes32 namespace) public view returns (uint) {
        require(tokenInfoExist(namespace) && infoPoll[namespace].finalized);
        uint avg = 0;
        if (infoPoll[namespace].totalEth != 0) {
            avg = infoPoll[namespace].totalTokenSold.div(infoPoll[namespace].totalEth);
        }
        return avg;
    }

    /** 
     * Return true if this token sale info exist.
     *
     * @param namespace namespace of the project
     * @return true if this project already have token sale.
     */
    function tokenInfoExist(bytes32 namespace) public view returns (bool) {
        return infoPoll[namespace].namespace == namespace && infoPoll[namespace].rate != 0;
    }

    /**
     * Purchase tokens
     *
     * Withdraw msg.value * rate tokens from TokenCollector, then
     * transfer tokens to msg.sender
     *
     * @param namespace namespace of the project
     */
    function buyTokens(bytes32 namespace) public payable {
        require(tokenInfoExist(namespace) && infoPoll[namespace].finalized == false);
        uint tokenNum = msg.value.mul(infoPoll[namespace].rate);

        TokenCollector tokenCollector =
            TokenCollector(contractAddressHandler.contracts(TOKEN_COLLECTOR_CI));

        require(tokenNum <= tokenCollector.balanceOf(infoPoll[namespace].token));

        tokenCollector.withdraw(infoPoll[namespace].token, msg.sender, tokenNum);

        infoPoll[namespace].totalTokenSold = infoPoll[namespace].totalTokenSold.add(tokenNum);
        infoPoll[namespace].totalEth = infoPoll[namespace].totalEth.add(msg.value);

        emit _BuyTokens(msg.sender, namespace, tokenNum, msg.value);
    }
}
