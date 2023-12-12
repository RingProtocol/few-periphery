pragma solidity =0.6.6;

import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IFewETHWrapper.sol';
import './interfaces/IFewWrappedToken.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWETH.sol';

contract FewETHWrapper is IFewETHWrapper {
    address public immutable override WETH;
    address public immutable override fwWETH;

    constructor(address _WETH, address _fwWETH) public {
        WETH = _WETH;
        fwWETH = _fwWETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // **** FEW WRAPPED TOKEN ****
    function wrapETHToFWWETH(address to)
        external
        virtual
        override
        payable
        returns (uint)
    {
        IWETH(WETH).deposit{value: msg.value}();
        IERC20(WETH).approve(fwWETH, msg.value);
        return IFewWrappedToken(fwWETH).wrapTo(msg.value, to);
    }
    function unwrapFWWETHToETH(uint amount, address to)
        external
        virtual
        override
        returns (uint)
    {
        TransferHelper.safeTransferFrom(fwWETH, msg.sender, address(this), amount);
        IFewWrappedToken(fwWETH).unwrapTo(amount, address(this));
        IWETH(WETH).withdraw(amount);
        TransferHelper.safeTransferETH(to, amount);
        return amount;
    }
}
