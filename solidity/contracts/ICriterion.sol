pragma solidity ^0.4.18;

interface ICriterion {
    /**
     * Returns a boolean indicating whether a criterion is
     * satisfied
     *
     * @param id The ID of a milestone
     * @return true: satisfied, false: unsatisfied
     */
    function satisfied(uint8 id) public returns (bool);

    /**
     * Returns the type of the criterion
     *
     * @return uint8 specifying the type
     */
    function t() public returns (uint8);
}
