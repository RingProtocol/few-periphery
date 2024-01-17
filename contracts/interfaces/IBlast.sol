pragma solidity >=0.5.0;

interface IBlast{
    function configureClaimableGas() external;
    function claimMaxGas(address contractAddress, address recipientOfGas) external returns (uint256);
}
