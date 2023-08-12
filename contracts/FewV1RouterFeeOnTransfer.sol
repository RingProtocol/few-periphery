pragma solidity =0.6.6;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IFewV1RouterFeeOnTransfer.sol';
import './interfaces/IFewFactory.sol';
import './interfaces/IFewWrappedToken.sol';
import './libraries/UniswapV2Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWETH.sol';

contract FewV1RouterFeeOnTransfer is IFewV1RouterFeeOnTransfer {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override WETH;
    address public immutable override fewFactory;
    address public immutable override fwWETH;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'UniswapV2Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH, address _fewFactory, address _fwWETH) public {
        factory = _factory;
        WETH = _WETH;
        fewFactory = _fewFactory;
        fwWETH = _fwWETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = UniswapV2Library.pairFor(factory, tokenA, tokenB);
        IUniswapV2Pair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint amount0, uint amount1) = IUniswapV2Pair(pair).burn(address(this));
        (address token0,) = UniswapV2Library.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'UniswapV2Router: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'UniswapV2Router: INSUFFICIENT_B_AMOUNT');
        IFewWrappedToken(tokenA).unwrapTo(amountA, to);
        IFewWrappedToken(tokenB).unwrapTo(amountB, to);
    }

    // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountETH) {
        (, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        address originalToken = IFewWrappedToken(token).token();
        TransferHelper.safeTransfer(originalToken, to, IERC20(originalToken).balanceOf(address(this)));
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }
    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountETH) {
        address pair = UniswapV2Library.pairFor(factory, token, fwWETH);
        uint value = approveMax ? uint(-1) : liquidity;
        IUniswapV2Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
            token, liquidity, amountTokenMin, amountETHMin, to, deadline
        );
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = UniswapV2Library.sortTokens(input, output);
            IUniswapV2Pair pair = IUniswapV2Pair(UniswapV2Library.pairFor(factory, input, output));
            uint amountInput;
            uint amountOutput;
            { // scope to avoid stack too deep errors
            (uint reserve0, uint reserve1,) = pair.getReserves();
            (uint reserveInput, uint reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
            amountOutput = UniswapV2Library.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(factory, output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) {
        address srcWrappedToken = path[0];
        address srcToken = IFewWrappedToken(srcWrappedToken).token();
        TransferHelper.safeTransferFrom(srcToken, msg.sender, address(this), amountIn);
        uint256 balanceSrcToken = IERC20(srcToken).balanceOf(address(this));
        IERC20(srcToken).approve(srcWrappedToken, balanceSrcToken);
        IFewWrappedToken(srcWrappedToken).wrapTo(balanceSrcToken, UniswapV2Library.pairFor(factory, path[0], path[1]));
        address dstWrappedToken = path[path.length - 1];
        address dstToken = IFewWrappedToken(dstWrappedToken).token();
        uint balanceDstTokenBefore = IERC20(dstToken).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint balanceDstWrappedToken = IERC20(dstWrappedToken).balanceOf(address(this));
        IFewWrappedToken(dstWrappedToken).unwrapTo(balanceDstWrappedToken, to);
        require(
            IERC20(dstToken).balanceOf(to).sub(balanceDstTokenBefore) >= amountOutMin,
            'UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        payable
        ensure(deadline)
    {
        require(path[0] == fwWETH, 'UniswapV2Router: INVALID_PATH');
        uint amountIn = msg.value;
        IWETH(WETH).deposit{value: amountIn}();
        IERC20(WETH).approve(fwWETH, amountIn);
        IFewWrappedToken(fwWETH).wrapTo(amountIn, UniswapV2Library.pairFor(factory, path[0], path[1]));
        address dstWrappedToken = path[path.length - 1];
        address dstToken = IFewWrappedToken(dstWrappedToken).token();
        uint balanceDstTokenBefore = IERC20(dstToken).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint balanceDstWrappedToken = IERC20(dstWrappedToken).balanceOf(address(this));
        IFewWrappedToken(dstWrappedToken).unwrapTo(balanceDstWrappedToken, to);
        require(
            IERC20(dstToken).balanceOf(to).sub(balanceDstTokenBefore) >= amountOutMin,
            'UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        ensure(deadline)
    {
        require(path[path.length - 1] == fwWETH, 'UniswapV2Router: INVALID_PATH');
        address srcWrappedToken = path[0];
        address srcToken = IFewWrappedToken(srcWrappedToken).token();
        TransferHelper.safeTransferFrom(srcToken, msg.sender, address(this), amountIn);
        IERC20(srcToken).approve(srcWrappedToken, amountIn);
        IFewWrappedToken(srcWrappedToken).wrapTo(amountIn, UniswapV2Library.pairFor(factory, path[0], path[1]));
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint amountOut = IERC20(fwWETH).balanceOf(address(this));
        require(amountOut >= amountOutMin, 'UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IFewWrappedToken(fwWETH).unwrap(amountOut);
        IWETH(WETH).withdraw(amountOut);
        TransferHelper.safeTransferETH(to, amountOut);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual override returns (uint amountB) {
        return UniswapV2Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountOut)
    {
        return UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountIn)
    {
        return UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return UniswapV2Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return UniswapV2Library.getAmountsIn(factory, amountOut, path);
    }
}
