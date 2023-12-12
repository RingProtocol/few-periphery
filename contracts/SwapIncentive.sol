// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.6.6;

import '@uniswap/lib/contracts/libraries/TransferHelper.sol';
import "./interfaces/ISwapIncentive.sol";
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';

contract SwapIncentive is ISwapIncentive {
    using SafeMath for uint;

    address public immutable override rewardToken;

    uint256 public override rewardRatio;
    address public override rewardSetter;

    constructor(address _rewardToken, uint256 _rewardRatio, address _rewardSetter) public {
        rewardToken = _rewardToken;
        rewardRatio = _rewardRatio;
        rewardSetter = _rewardSetter;
    }

    function setRewardRatio(uint256 _rewardRatio) external override {
        require(msg.sender == rewardSetter, 'SwapIncentive: FORBIDDEN');
        rewardRatio = _rewardRatio;
    }

    function setRewardSetter(address _rewardSetter) external override {
        require(msg.sender == rewardSetter, 'SwapIncentive: FORBIDDEN');
        rewardSetter = _rewardSetter;
    }

    function incentivize(
        address,
        address,
        address,
        uint256 amount) external override {
        uint256 _rewardRatio = rewardRatio;
        if (_rewardRatio > 0 && amount > 0) {
            uint rewardAmount = amount.mul(_rewardRatio) / (10**18);
            if (IERC20(rewardToken).balanceOf(address(this)) >= rewardAmount) {
                // we can use tx.origin to determine who paid the gas fee
                // tx origin is not safe for authorization, but is safe for this purpose.
                TransferHelper.safeTransfer(address(rewardToken), tx.origin, rewardAmount);
            }
        }
    }

    function withdrawERC20(
        address token,
        address to,
        uint256 amount
    ) external virtual override {
        require(msg.sender == rewardSetter, 'SwapIncentive: FORBIDDEN');
        TransferHelper.safeTransfer(token, to, amount);
    }

    function withdrawETH(address payable to, uint256 amountOut) external virtual override {
        require(msg.sender == rewardSetter, 'SwapIncentive: FORBIDDEN');
        TransferHelper.safeTransferETH(to, amountOut);
    }
}
