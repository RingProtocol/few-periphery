pragma solidity =0.6.6;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './IFewV1RouterFeeOnTransfer.sol';
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

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        // create the pair if it doesn't exist yet
        if (IUniswapV2Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            IUniswapV2Factory(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = UniswapV2Library.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = UniswapV2Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'UniswapV2Router: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = UniswapV2Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'UniswapV2Router: INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        // create the wrapped token if it doesn't exist yet
        if (IFewFactory(fewFactory).getWrappedToken(tokenA) == address(0)) {
            IFewFactory(fewFactory).createToken(tokenA);
        }
        if (IFewFactory(fewFactory).getWrappedToken(tokenB) == address(0)) {
            IFewFactory(fewFactory).createToken(tokenB);
        }
        address wrappedTokenA = IFewFactory(fewFactory).getWrappedToken(tokenA);
        address wrappedTokenB = IFewFactory(fewFactory).getWrappedToken(tokenB);
        (amountA, amountB) = _addLiquidity(wrappedTokenA, wrappedTokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = UniswapV2Library.pairFor(factory, wrappedTokenA, wrappedTokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, address(this), amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, address(this), amountB);
        IERC20(tokenA).approve(wrappedTokenA, amountA);
        IERC20(tokenB).approve(wrappedTokenB, amountB);
        IFewWrappedToken(wrappedTokenA).wrapTo(amountA.sub(amountA/100), pair);
        IFewWrappedToken(wrappedTokenB).wrapTo(amountB.sub(amountB/100), pair);
        liquidity = IUniswapV2Pair(pair).mint(to);
    }
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external virtual payable ensure(deadline) returns (uint amountToken, uint amountETH, uint liquidity) {
        // create the wrapped token if it doesn't exist yet
        if (IFewFactory(fewFactory).getWrappedToken(token) == address(0)) {
            IFewFactory(fewFactory).createToken(token);
        }
        address wrappedToken = IFewFactory(fewFactory).getWrappedToken(token);
        (amountToken, amountETH) = _addLiquidity(
            wrappedToken,
            fwWETH,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        address pair = UniswapV2Library.pairFor(factory, wrappedToken, fwWETH);
        TransferHelper.safeTransferFrom(token, msg.sender, address(this), amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        IERC20(token).approve(wrappedToken, amountToken);
        IERC20(WETH).approve(fwWETH, amountETH);
        IFewWrappedToken(wrappedToken).wrapTo(amountToken, pair);
        IFewWrappedToken(fwWETH).wrapTo(amountETH, pair);
        liquidity = IUniswapV2Pair(pair).mint(to);
        // refund dust eth, if any
        if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
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
        IFewWrappedToken(tokenA).unwrapTo(amountA.sub(amountA/100), to);
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
            fwWETH,
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
        // amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
        //     token, liquidity, amountTokenMin, amountETHMin, to, deadline
        // );
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
        IFewWrappedToken(srcWrappedToken).wrapTo(amountIn.sub(amountIn/100), UniswapV2Library.pairFor(factory, path[0], path[1]));
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
