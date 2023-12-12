pragma solidity >=0.6.2;

import './IUniswapV2Router01.sol';

interface IFewRouter is IUniswapV2Router01 {
    function fewFactory() external pure returns (address);
    function fwWETH() external pure returns (address);
    function FWRNG() external pure returns (address);

    function getPermittedAccount(address permittedAccount) external view returns (bool enabled);
    function incentiveContract() external view returns (address);
    function setPermittedAccount(address permittedAccount, bool enabled) external;
    function setIncentiveContract(address incentive) external;
}
