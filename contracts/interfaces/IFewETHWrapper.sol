pragma solidity >=0.6.2;

interface IFewETHWrapper {
    function WETH() external pure returns (address);
    function fwWETH() external pure returns (address);

    function wrapETHToFWWETH(address to) external payable returns (uint);
    function unwrapFWWETHToETH(uint amount, address to) external returns (uint);
}
