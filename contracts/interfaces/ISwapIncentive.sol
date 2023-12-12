// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface ISwapIncentive {
    function rewardToken() external pure returns (address);

    function rewardRatio() external view returns (uint256);
    function rewardSetter() external view returns (address);

    function setRewardRatio(uint256) external;
    function setRewardSetter(address) external;
    function incentivize(address sender, address recipient, address operator, uint256 amount) external;
    function withdrawERC20(address token, address to, uint256 amount) external;
    function withdrawETH(address payable to, uint256 amount) external;
}
