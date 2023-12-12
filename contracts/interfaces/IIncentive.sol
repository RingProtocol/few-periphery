pragma solidity >=0.5.0;

interface IIncentive {
    function incentivize(
        address sender,
        address receiver,
        address operator,
        uint256 amount
    ) external;
}
