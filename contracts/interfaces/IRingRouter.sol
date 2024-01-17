pragma solidity >=0.6.2;

import './IUniswapV2Router01Base.sol';

interface IRingRouter is IUniswapV2Router01Base {
    function fewFactory() external pure returns (address);
    function fwWETH() external pure returns (address);

    function getPermittedAccount(address permittedAccount) external view returns (bool enabled);
    function setPermittedAccount(address permittedAccount, bool enabled) external;

    function claimMaxGas(address recipient) external returns (uint);
}
