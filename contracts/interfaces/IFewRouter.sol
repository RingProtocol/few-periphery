pragma solidity >=0.6.2;

import './IUniswapV2Router01.sol';

interface IFewRouter is IUniswapV2Router01 {
    function fewFactory() external pure returns (address);
    function fwWETH() external pure returns (address);
}
