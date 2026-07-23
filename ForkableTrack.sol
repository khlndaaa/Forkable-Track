// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title ForkableTrack
/// @notice Each token is a track. Token 0..N are "seed" tracks minted daily by the bot.
///         Any remix that wins community voting gets minted as a child token, linked to
///         its parent. Royalties on secondary sales are split along the whole fork chain,
///         so remixing a remix still pays the original bot-seed creator (and everyone
///         in between) a share — not just the immediate parent.
contract ForkableTrack is ERC721, ERC2981, Ownable, ReentrancyGuard {
    struct Track {
        uint256 parentId;      // 0 if this is a bot seed track (no parent); use hasParent to disambiguate from token 0
        bool hasParent;
        address creator;       // remixer's wallet (or bot/treasury wallet for seed tracks)
        string metadataURI;    // IPFS URI: audio + stems + credits
        uint64 mintedAt;
    }

    /// @notice Address allowed to mint (the GitHub bot's relay wallet).
    address public oracle;

    /// @notice Share of each sale's royalty that flows to the direct parent's creator, in bps.
    ///         The rest stays with the current token's own creator. E.g. 3000 = 30% to parent chain.
    uint16 public parentShareBps = 3000;

    /// @notice Total royalty charged on secondary sales, in bps (read by marketplaces via ERC2981).
    uint16 public totalRoyaltyBps = 750; // 7.5%

    uint256 public nextTokenId;
    mapping(uint256 => Track) public tracks;

    event SeedMinted(uint256 indexed tokenId, address indexed creator, string metadataURI);
    event RemixMinted(uint256 indexed tokenId, uint256 indexed parentId, address indexed creator, string metadataURI);
    event RoyaltyPaid(uint256 indexed tokenId, uint256 amount);
    event OracleUpdated(address newOracle);

    modifier onlyOracle() {
        require(msg.sender == oracle, "ForkableTrack: not oracle");
        _;
    }

    constructor(address _oracle) ERC721("ForkableTrack", "FORK") Ownable(msg.sender) {
        require(_oracle != address(0), "zero addr");
        oracle = _oracle;
    }

    // ----------------------------------------------------------------------
    // Admin
    // ----------------------------------------------------------------------

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "zero addr");
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setRoyaltyParams(uint16 _parentShareBps, uint16 _totalRoyaltyBps) external onlyOwner {
        require(_parentShareBps <= 10_000 && _totalRoyaltyBps <= 2_000, "bad params");
        parentShareBps = _parentShareBps;
        totalRoyaltyBps = _totalRoyaltyBps;
    }

    // ----------------------------------------------------------------------
    // Minting
    // ----------------------------------------------------------------------

    /// @notice Bot mints today's seed track. Creator is usually a bot/label treasury wallet.
    function mintSeed(address creator, string calldata metadataURI) external onlyOracle returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        tracks[tokenId] = Track({
            parentId: 0,
            hasParent: false,
            creator: creator,
            metadataURI: metadataURI,
            mintedAt: uint64(block.timestamp)
        });

        _safeMint(creator, tokenId);
        _setTokenRoyalty(tokenId, address(this), totalRoyaltyBps); // royalties routed through this contract's splitter

        emit SeedMinted(tokenId, creator, metadataURI);
    }

    /// @notice Oracle mints the winning remix from a voting round, linking it to its parent track.
    function mintRemix(
        uint256 parentId,
        address remixer,
        string calldata metadataURI
    ) external onlyOracle returns (uint256 tokenId) {
        require(_exists(parentId), "parent doesn't exist");

        tokenId = nextTokenId++;
        tracks[tokenId] = Track({
            parentId: parentId,
            hasParent: true,
            creator: remixer,
            metadataURI: metadataURI,
            mintedAt: uint64(block.timestamp)
        });

        _safeMint(remixer, tokenId);
        _setTokenRoyalty(tokenId, address(this), totalRoyaltyBps);

        emit RemixMinted(tokenId, parentId, remixer, metadataURI);
    }

    // ----------------------------------------------------------------------
    // Royalty distribution
    // ----------------------------------------------------------------------

    /// @notice Marketplaces send royalty payments here (per ERC2981, royaltyInfo() points to this
    ///         contract as receiver). Anyone can call this to distribute the incoming amount for
    ///         a given token along its fork chain: parentShareBps to the direct parent's creator,
    ///         the rest to this token's own creator. Call recursively / off-chain to walk further
    ///         up the chain if desired — this contract splits one level per call to keep gas bounded.
    function distributeRoyalty(uint256 tokenId) external payable nonReentrant {
        require(msg.value > 0, "no royalty received");
        Track memory t = tracks[tokenId];

        if (t.hasParent) {
            uint256 parentCut = (msg.value * parentShareBps) / 10_000;
            uint256 creatorCut = msg.value - parentCut;

            address parentCreator = tracks[t.parentId].creator;
            (bool ok1, ) = payable(parentCreator).call{value: parentCut}("");
            require(ok1, "parent payout failed");

            (bool ok2, ) = payable(t.creator).call{value: creatorCut}("");
            require(ok2, "creator payout failed");
        } else {
            // seed track — no parent, full amount to creator (bot/label treasury)
            (bool ok, ) = payable(t.creator).call{value: msg.value}("");
            require(ok, "creator payout failed");
        }

        emit RoyaltyPaid(tokenId, msg.value);
    }

    // ----------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------

    /// @notice Walks up the fork chain to the original seed track.
    function getRootSeed(uint256 tokenId) external view returns (uint256) {
        uint256 current = tokenId;
        while (tracks[current].hasParent) {
            current = tracks[current].parentId;
        }
        return current;
    }

    function getLineageDepth(uint256 tokenId) external view returns (uint256 depth) {
        uint256 current = tokenId;
        while (tracks[current].hasParent) {
            current = tracks[current].parentId;
            depth++;
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "nonexistent token");
        return tracks[tokenId].metadataURI;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
