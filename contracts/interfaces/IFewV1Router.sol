pragma solidity >=0.6.2;

import './IFewRouter01.sol';

interface IFewV1Router is IFewRouter01 {
    function fewFactory() external pure returns (address);
    function fwWETH() external pure returns (address);
}
