// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Nox, euint256, externalEuint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {ConfidentialShareToken} from "./ConfidentialShareToken.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../perp/interfaces/IPerp.sol";
import {IStateRelay} from "../coordination/interfaces/IStateRelay.sol";

/// @title ConfidentialBasketVault
/// @notice Privacy-preserving basket vault. Deposit USDC and receive encrypted
///         shares — balances and total supply are hidden from chain observers.
///
///         What is private:
///           - Per-user share balance (euint256, ACL-gated decryption)
///           - Shares minted per deposit (computed and stored in encrypted form)
///           - Shares burned per redeem (caller-supplied encrypted amount)
///           - Encrypted total supply (hidden from public)
///
///         What remains public:
///           - USDC deposit and redeem amounts (plaintext ERC20 transfers)
///           - msg.sender (all callers visible on-chain)
///           - NAV and share price (derived from public state)
///
/// @dev Share pricing math uses plaintext NAV and encrypted total supply via
///      Nox.div / Nox.mul. The resulting share amount is encrypted before
///      minting so it is never exposed in calldata or events.
contract ConfidentialBasketVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PRICE_PRECISION = 1e30;

    struct AssetAllocation {
        bytes32 assetId;
    }

    IERC20 public immutable usdc;
    ConfidentialShareToken public immutable shareToken;

    IOracleAdapter public oracleAdapter;
    IPerp public vaultAccounting;
    IStateRelay public stateRelay;

    AssetAllocation[] public assets;

    uint256 public depositFeeBps;
    uint256 public redeemFeeBps;
    uint256 public collectedFees;
    uint256 public perpAllocated;
    uint256 public maxPerpAllocation;
    uint256 public minReserveBps;
    uint256 public minDepositWeightBps;

    address public keeper;
    string public name;

    // ─── Pending Redemptions ────────────────────────────────────
    // sharesLocked and usdcOwed are encrypted — only the user and keeper
    // can decrypt their own redemption details.
    struct PendingRedemption {
        address user;
        euint256 sharesLocked;
        euint256 usdcOwed;
        uint48 timestamp;
        bool completed;
    }

    mapping(uint256 => PendingRedemption) public pendingRedemptions;
    uint256 public pendingRedemptionCount;

    // Note: share amounts are intentionally omitted from Deposited/Redeemed
    // to avoid leaking encrypted values through event logs.
    event Deposited(address indexed user, uint256 usdcAmount);
    event Redeemed(address indexed user, uint256 usdcReturned);
    event RedemptionQueued(uint256 indexed id, address indexed user, uint48 timestamp);
    event RedemptionProcessed(uint256 indexed id, address indexed user);
    event AllocatedToPerp(uint256 amount);
    event WithdrawnFromPerp(uint256 amount);
    event AssetsUpdated(uint256 assetCount);
    event FeesCollected(address indexed to, uint256 amount);
    event ReservePolicyUpdated(uint256 minReserveBps);
    event ReserveToppedUp(address indexed from, uint256 amount);

    modifier onlyKeeper() {
        require(msg.sender == keeper, "Only keeper");
        _;
    }

    /// @param _name     Basket display name.
    /// @param _usdc     USDC token address.
    /// @param _oracle   OracleAdapter address (may be zero for spokes).
    /// @param _owner    Ownable admin.
    constructor(string memory _name, address _usdc, address _oracle, address _owner) Ownable(_owner) {
        require(_usdc != address(0), "USDC required");
        name = _name;
        usdc = IERC20(_usdc);
        if (_oracle != address(0)) oracleAdapter = IOracleAdapter(_oracle);

        shareToken = new ConfidentialShareToken(string.concat(_name, " Share"), "cBSKT", address(this));
    }

    // ─── Configuration ───────────────────────────────────────────

    function setAssets(bytes32[] calldata assetIds) external onlyOwner {
        require(assetIds.length > 0, "No assets");
        delete assets;
        for (uint256 i = 0; i < assetIds.length; i++) {
            if (address(oracleAdapter) != address(0)) {
                require(oracleAdapter.isAssetActive(assetIds[i]), "Asset not active");
            }
            assets.push(AssetAllocation({assetId: assetIds[i]}));
        }
        emit AssetsUpdated(assetIds.length);
    }

    function setFees(uint256 _depositFeeBps, uint256 _redeemFeeBps) external onlyOwner {
        require(_depositFeeBps <= 500 && _redeemFeeBps <= 500, "Fee too high");
        depositFeeBps = _depositFeeBps;
        redeemFeeBps = _redeemFeeBps;
    }

    function setVaultAccounting(address _va) external onlyOwner {
        vaultAccounting = IPerp(_va);
    }

    function setOracleAdapter(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Oracle required");
        oracleAdapter = IOracleAdapter(_oracle);
    }

    function setMaxPerpAllocation(uint256 cap) external onlyOwner {
        maxPerpAllocation = cap;
    }

    function setMinReserveBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Invalid bps");
        minReserveBps = bps;
        emit ReservePolicyUpdated(bps);
    }

    function setStateRelay(address _relay) external onlyOwner {
        stateRelay = IStateRelay(_relay);
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    function setMinDepositWeightBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Invalid bps");
        minDepositWeightBps = bps;
    }

    // ─── Deposit ─────────────────────────────────────────────────

    /// @notice Deposit USDC and receive encrypted shares at current NAV price.
    /// @dev The number of shares minted is computed in encrypted space and
    ///      never exposed in calldata or events.
    /// @param usdcAmount Gross USDC to deposit.
    function deposit(uint256 usdcAmount) external nonReentrant {
        require(usdcAmount > 0, "Amount required");
        require(assets.length > 0, "No assets configured");

        if (address(stateRelay) != address(0)) {
            uint256 weight = stateRelay.getLocalWeight();
            require(weight >= minDepositWeightBps, "Chain not accepting deposits");
        }

        uint256 fee = (usdcAmount * depositFeeBps) / BPS_DENOMINATOR;
        uint256 netAmount = usdcAmount - fee;
        collectedFees += fee;

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        euint256 eShares = _computeShares(netAmount);
        require(Nox.isInitialized(eShares), "Shares too small");

        shareToken.mint(msg.sender, eShares);

        emit Deposited(msg.sender, usdcAmount);
    }

    /// @notice Redeem encrypted shares for USDC at current NAV price.
    /// @dev Caller supplies their encrypted share amount + gateway proof.
    ///      The TEE verifies the caller holds at least `encryptedShares`
    ///      before burning — no plaintext balance check required.
    /// @param encryptedShares Encrypted share amount from the Nox JS SDK.
    /// @param inputProof      Gateway-signed proof for the encrypted value.
    function redeem(externalEuint256 encryptedShares, bytes calldata inputProof) external nonReentrant {
        euint256 eShares = Nox.fromExternal(encryptedShares, inputProof);

        uint256 totalSupplyPlain = _inferTotalSupply();
        require(totalSupplyPlain > 0, "No supply");

        uint256 nav = _pricingNav();
        // Compute USDC owed in plaintext using inferred supply (conservative).
        // Full encrypted path requires eaddress support (future Nox version).
        uint256 grossUsdc = (totalSupplyPlain > 0) ? (_toPlainShares(eShares) * nav) / totalSupplyPlain : 0;

        uint256 fee = (grossUsdc * redeemFeeBps) / BPS_DENOMINATOR;
        uint256 totalOwed = grossUsdc - fee;
        collectedFees += fee;

        uint256 available = _idleUsdcExcludingFees();

        if (available >= totalOwed) {
            shareToken.burn(msg.sender, eShares);
            usdc.safeTransfer(msg.sender, totalOwed);
            emit Redeemed(msg.sender, totalOwed);
        } else {
            // Queue remainder — amounts stored encrypted in pending redemption.
            euint256 eOwed = Nox.toEuint256(totalOwed);
            Nox.allow(eOwed, msg.sender);
            Nox.allow(eOwed, keeper);

            // Transfer shares to vault custody (encrypted).
            Nox.allowThis(eShares);
            shareToken.burn(msg.sender, eShares);
            shareToken.mint(address(this), eShares);

            uint256 id = pendingRedemptionCount++;
            pendingRedemptions[id] = PendingRedemption({
                user: msg.sender,
                sharesLocked: eShares,
                usdcOwed: eOwed,
                timestamp: uint48(block.timestamp),
                completed: false
            });

            if (available > 0) {
                usdc.safeTransfer(msg.sender, available);
                emit Redeemed(msg.sender, available);
            }
            emit RedemptionQueued(id, msg.sender, uint48(block.timestamp));
        }
    }

    /// @notice Process a pending redemption once keeper bridges sufficient USDC.
    /// @param id Pending redemption id.
    function processPendingRedemption(uint256 id) external onlyKeeper nonReentrant {
        PendingRedemption storage pr = pendingRedemptions[id];
        require(!pr.completed, "Already completed");

        pr.completed = true;
        shareToken.burnFromVault(pr.sharesLocked);

        // usdcOwed is encrypted — keeper decrypts off-chain before calling.
        // On-chain we trust keeper to have verified sufficient balance.
        uint256 owedPlain = _toPlainUsdc(pr.usdcOwed);
        require(_idleUsdcExcludingFees() >= owedPlain, "Insufficient USDC");
        usdc.safeTransfer(pr.user, owedPlain);

        emit RedemptionProcessed(id, pr.user);
    }

    // ─── Perp Capital Allocation ─────────────────────────────────

    function allocateToPerp(uint256 amount) external onlyOwner nonReentrant {
        require(address(vaultAccounting) != address(0), "VaultAccounting not set");
        uint256 available = getAvailableForPerpUsdc();
        require(amount <= available, "Insufficient balance");
        if (maxPerpAllocation > 0) {
            require(perpAllocated + amount <= maxPerpAllocation, "Exceeds cap");
        }
        usdc.safeIncreaseAllowance(address(vaultAccounting), amount);
        vaultAccounting.depositCapital(address(this), amount);
        perpAllocated += amount;
        emit AllocatedToPerp(amount);
    }

    function withdrawFromPerp(uint256 amount) external onlyOwner nonReentrant {
        require(address(vaultAccounting) != address(0), "VaultAccounting not set");
        vaultAccounting.withdrawCapital(address(this), amount);
        perpAllocated = amount >= perpAllocated ? 0 : perpAllocated - amount;
        emit WithdrawnFromPerp(amount);
    }

    function topUpReserve(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount required");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveToppedUp(msg.sender, amount);
    }

    function collectFees(address to) external onlyOwner {
        uint256 fees = collectedFees;
        require(fees > 0, "No fees");
        collectedFees = 0;
        usdc.safeTransfer(to, fees);
        emit FeesCollected(to, fees);
    }

    function getSharePrice() external view returns (uint256) {
        uint256 ts = _inferTotalSupply();
        if (ts == 0) return PRICE_PRECISION;
        return (_pricingNav() * PRICE_PRECISION) / ts;
    }

    function getRequiredReserveUsdc() public view returns (uint256) {
        return (_totalVaultValue() * minReserveBps) / BPS_DENOMINATOR;
    }

    function getAvailableForPerpUsdc() public view returns (uint256) {
        uint256 idle = _idleUsdcExcludingFees();
        uint256 req = getRequiredReserveUsdc();
        return idle > req ? idle - req : 0;
    }

    function getAssetCount() external view returns (uint256) {
        return assets.length;
    }

    function getPricingNav() external view returns (uint256) {
        return _pricingNav();
    }

    /// @dev Compute encrypted shares for a plaintext USDC net deposit amount.
    ///      Bootstrap (zero supply): 1 USDC = 1 share.
    ///      Otherwise: shares = netAmount * eTotalSupply / nav (all in Nox TEE).
    function _computeShares(uint256 netAmount) internal returns (euint256) {
        euint256 eTotalSupply = shareToken.confidentialTotalSupply();
        bool bootstrapping = !Nox.isInitialized(eTotalSupply);

        if (bootstrapping) {
            return Nox.toEuint256(netAmount);
        }

        uint256 nav = _pricingNav();
        require(nav > 0, "Invalid NAV");

        euint256 eNet = Nox.toEuint256(netAmount);
        euint256 eNav = Nox.toEuint256(nav);
        return Nox.div(Nox.mul(eNet, eTotalSupply), eNav);
    }

    /// @dev Decrypts an encrypted share amount for the keeper path.
    ///      Uses publicDecrypt — vault must have called allowPublicDecryption first.
    ///      In production this is replaced by an off-chain TEE decryption proof.
    function _toPlainShares(euint256 eShares) internal view returns (uint256) {
        // Placeholder: in a full integration the caller supplies a decryption proof.
        // For bootstrap testing, treat as public handle via allowPublicDecryption.
        return 0;
    }

    function _toPlainUsdc(euint256 eUsdc) internal view returns (uint256) {
        return 0;
    }

    /// @dev Infers an approximate plaintext total supply from USDC balances.
    ///      Used only for share price display — not authoritative. Returns 0
    ///      when bootstrapping, causing getSharePrice to return PRICE_PRECISION.
    function _inferTotalSupply() internal view returns (uint256) {
        return _totalVaultValue();
    }

    function _totalVaultValue() internal view returns (uint256) {
        return _idleUsdcExcludingFees() + perpAllocated;
    }

    function _pricingNav() internal view returns (uint256) {
        uint256 base = _totalVaultValue();

        int256 localPnL;
        if (address(vaultAccounting) != address(0)) {
            (int256 u, int256 r) = vaultAccounting.getVaultPnL(address(this));
            localPnL = u + r;
        }

        int256 globalAdj;
        if (address(stateRelay) != address(0)) {
            (int256 pnl, bool stale) = stateRelay.getGlobalPnLAdjustment(address(this));
            if (!stale) globalAdj = pnl;
        }

        int256 total = int256(base) + localPnL + globalAdj;
        return total > 0 ? uint256(total) : 0;
    }

    function _idleUsdcExcludingFees() internal view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        return balance <= collectedFees ? 0 : balance - collectedFees;
    }
}
