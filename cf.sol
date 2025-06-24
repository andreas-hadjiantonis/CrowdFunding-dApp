// SPDX-License-Identifier: MIT
//ics21138 - Andreas Hadjiantonis
pragma solidity ^0.8.26;

contract Crowdfunding {

    address public owner;
    address public constant specialOwner = 0x153dfef4355E823dCB0FCc76Efe942BefCa86477;
    uint public campaignFee = 0.02 ether;
    uint public reservationFeePercentage = 20; //20%
    uint public campaignCount;
    uint public totalFeesAccumulated;

    bool public destroyed;

    struct Campaign {

        uint id;
        address entrepreneur;
        string title;
        uint pledgeCost;
        uint pledgesNeeded;
        uint pledgesCount;
        bool fulfilled;
        bool withdraw;
        bool cancelled;
        bool feeWithdrawn;
        address[] backers;
        mapping(address => uint) backersPledges; 
    }

    mapping(uint => Campaign) public campaigns;
    mapping(string => bool) public titles; //purpose of this mapping is to track titles
    mapping(address => bool) public bannedEntrepreneurs;
    address[] public bannedEntrepreneursList; //same as previous line, different access

    //events
    event CampaignCreated(address indexed entrepreneur, uint id, string title, uint pledgeCost, uint pledgesNeeded);
    event CampaignFunded(address indexed backer, uint id, uint pledges);
    event CampaignCancelled(address indexed canceller, uint id);
    event CampaignFulfilled(address indexed closer, uint id, uint payout);
    event BackerCompensated(address indexed backer, uint id, uint amount);
    event ContractDestroyed(address indexed owner, uint balance);

    //Modifiers
    //Owner Related
     modifier onlyOwner() {
        require(msg.sender == owner || msg.sender == specialOwner, "Not authorized");
        _;
    }
    modifier notOwner() {
        require(msg.sender != owner, "Owner cannot perform this action");
        _;
    }
    modifier validNewOwner(address newOwner) { /* Exists in case of accidental click */
        require(newOwner != address(0), "New owner must have an address");
        _;
    }
    //Banned Entrepreneurs Related
    modifier notBanned() {
        require(!bannedEntrepreneurs[msg.sender], "You are banned");
        _;
    }
    modifier alreadyBanned(address entrepreneur) {
        require(!bannedEntrepreneurs[entrepreneur], "Entrepreneur is already banned");
        _;
    }
    //Campaign Related
    modifier validCampaignFee() {
        require(msg.value == campaignFee, "Incorrect Campaign Fee");
        _;
    }
    modifier campaignExists(uint campaignId) {
        require(campaignId > 0 && campaignId <= campaignCount, "Campaign does not exist");
        _;
    }
    modifier uniqueTitle(string memory title) {
        require(!titles[title], "Campaign title must be unique");
        _;
    }
    modifier onlyIfCancelled(uint campaignId) {
        require(campaigns[campaignId].cancelled, "Campaign is not cancelled");
        _;
    }
    modifier notCancelled(uint campaignId) {
        require(!campaigns[campaignId].cancelled, "Campaign is cancelled");
        _;
    }
    modifier notFulfilled(uint campaignId) {
        require(!campaigns[campaignId].fulfilled, "Campaign is already fulfilled");
        _;
    }
    modifier fullyFunded(uint campaignId) {
        require(campaigns[campaignId].pledgesCount >= campaigns[campaignId].pledgesNeeded, "Campaign not fully funded");
        _;
    }
    modifier notAlreadyCompleted(uint campaignId) {
        require(!campaigns[campaignId].fulfilled, "Campaign already completed");
        _;
    }
    modifier hasRefundablePledges(uint campaignId) {
        require(campaigns[campaignId].backersPledges[msg.sender] > 0, "No funds to compensate");
        _;
    }
    //Backer Related
    modifier validPayment(uint campaignId, uint numPledges) {
        require(msg.value == campaigns[campaignId].pledgeCost * numPledges, "Incorrect payment amount");
        _;
    }
     //Owner Or Entrepreneur Related
    modifier onlyAuthorized(uint campaignId) {
        require(msg.sender == campaigns[campaignId].entrepreneur || msg.sender == owner, "Not authorized");
        _;
    }
    //Contract Related
    modifier notDestroyed() {
        require(!destroyed, "Contract is destroyed");
        _;
    }   

    constructor() { owner = msg.sender; }

    //BASIC FUNCTIONS
    function createCampaign(string memory title, uint pledgeCost, uint pledgesNeeded) external payable notOwner notDestroyed notBanned validCampaignFee uniqueTitle(title) {

        totalFeesAccumulated += campaignFee;

        campaignCount++; // Unique identification number for each campaign
        Campaign storage newCampaign = campaigns[campaignCount];
        newCampaign.id = campaignCount;
        newCampaign.entrepreneur = msg.sender;
        newCampaign.title = title;
        newCampaign.pledgeCost = pledgeCost * 1 ether;
        newCampaign.pledgesNeeded = pledgesNeeded;
        newCampaign.feeWithdrawn = false;

        // Mark the title as used
        titles[title] = true;

        emit CampaignCreated(msg.sender, campaignCount, title, pledgeCost, pledgesNeeded);
    }

    function fundCampaign(uint campaignId, uint numPledges) external payable notDestroyed notCancelled(campaignId) notFulfilled(campaignId) validPayment(campaignId, numPledges) {
        Campaign storage campaign = campaigns[campaignId];

        if (campaign.backersPledges[msg.sender] == 0) {
            campaign.backers.push(msg.sender);
        }
        campaign.backersPledges[msg.sender] += numPledges;
        campaign.pledgesCount += numPledges;

        emit CampaignFunded(msg.sender, campaignId, numPledges);
    }

    //Campaign Cancellation
    function cancelCampaign(uint campaignId) external onlyAuthorized(campaignId) notFulfilled(campaignId) notCancelled(campaignId) {
        Campaign storage campaign = campaigns[campaignId];
        campaign.cancelled = true;
        campaign.withdraw = true;
        
        emit CampaignCancelled(msg.sender, campaignId);
    }

    function fulfillCampaign(uint campaignId) external onlyAuthorized(campaignId) notCancelled(campaignId) fullyFunded(campaignId) notAlreadyCompleted(campaignId) campaignExists(campaignId) {
        
        Campaign storage campaign = campaigns[campaignId];

        uint payout = (campaign.pledgeCost * campaign.pledgesCount * 80) / 100;
        campaign.fulfilled = true;
        payable(campaign.entrepreneur).transfer(payout);
        campaign.withdraw = true; //When value is true the owner can withdraw the 20%

        emit CampaignFulfilled(msg.sender, campaignId, payout);
    }

    function compensateBacker() external {

        uint totalRefund;

        for (uint i = 1; i <= campaignCount; i++) {
            Campaign storage campaign = campaigns[i];

            if (campaign.cancelled && campaign.backersPledges[msg.sender] > 0) {
                uint refundAmount = campaign.backersPledges[msg.sender] * campaign.pledgeCost;
                totalRefund += refundAmount;
                campaign.backersPledges[msg.sender] = 0; // Reset backer Pledges for the campaign

                emit BackerCompensated(msg.sender, campaign.id, refundAmount);
            }
        }

        require(totalRefund > 0, "No refundable Pledges available");
        payable(msg.sender).transfer(totalRefund);
    }

    //Campaign's backers & Their pladges
    function getBackers(uint id) external view returns (address[] memory, uint[] memory) {
        Campaign storage campaign = campaigns[id];
        uint backerCount = campaign.backers.length;

        address[] memory backers = new address[](backerCount);
        uint[] memory Pledges = new uint[](backerCount);

        for (uint i = 0; i < backerCount; i++) {
            backers[i] = campaign.backers[i];
            Pledges[i] = campaign.backersPledges[campaign.backers[i]];
        }

        return (backers, Pledges);
    }

    //how many Pledges the backer owns and by which campaigns.
    function getBackerPledges(address backer) external view returns (uint[] memory, uint[] memory) {
        uint PledgeCount;
            for (uint i = 1; i <= campaignCount; i++) {
                if (campaigns[i].backersPledges[backer] > 0) {
                    PledgeCount++;
                }
            }

        uint[] memory campaignIds = new uint[](PledgeCount);
        uint[] memory Pledges = new uint[](PledgeCount);

        uint index;
        for (uint i = 1; i <= campaignCount; i++) {
            if (campaigns[i].backersPledges[backer] > 0) {
                campaignIds[index] = campaigns[i].id;
                Pledges[index] = campaigns[i].backersPledges[backer];
                index++;
            }
        }

        return (campaignIds, Pledges);
    }

    //Total Fees Saved in the Contract
    function getTotalFees() external view returns(uint){
        uint totalFees;

        for (uint i = 1; i <= campaignCount; i++) {
            Campaign storage campaign = campaigns[i];
                if (campaign.fulfilled && campaign.withdraw == true) {
                    uint reservationFee = (campaign.pledgeCost * campaign.pledgesCount * reservationFeePercentage) / 100;
                    totalFees += reservationFee + campaignFee;
                }
        }

        return totalFees;

    }

    //Withdraw Fees to Owner (20% + 0.02 ETHs)
    function withdrawFees() external onlyOwner {
    uint totalFees;

    for (uint i = 1; i <= campaignCount; i++) {
        Campaign storage campaign = campaigns[i];

        if (!campaign.feeWithdrawn) {
            totalFees += campaignFee;
            campaign.feeWithdrawn = true; 
        }

        if (campaign.fulfilled && campaign.withdraw) {
            uint reservationFee = (campaign.pledgeCost * campaign.pledgesCount * reservationFeePercentage) / 100;
            totalFees += reservationFee;
            campaign.withdraw = false; 
        }

        if (campaign.cancelled && campaign.withdraw) {
            campaign.withdraw = false;
        }
    }

    require(totalFees > 0, "No fees available to withdraw");
    payable(owner).transfer(totalFees);
    }

    function getActiveCampaigns() external  view returns (uint[] memory, address[] memory, string[] memory, uint[] memory, uint[] memory, uint[] memory) {
        uint activeCount;
        for (uint i = 1; i <= campaignCount; i++) {
            if (!campaigns[i].cancelled && !campaigns[i].fulfilled) {
                activeCount++;
            }
        }

        uint[] memory ids = new uint[](activeCount);
        address[] memory entrepreneurs = new address[](activeCount);
        string[] memory temptitles = new string[](activeCount);
        uint[] memory pledgeCosts = new uint[](activeCount);
        uint[] memory pledgesNeeded = new uint[](activeCount);
        uint[] memory pledgesCounts = new uint[](activeCount); 

        uint index;
        for (uint i = 1; i <= campaignCount; i++) {
            if (!campaigns[i].cancelled && !campaigns[i].fulfilled) {
                ids[index] = campaigns[i].id;
                entrepreneurs[index] = campaigns[i].entrepreneur;
                temptitles[index] = campaigns[i].title;
                pledgeCosts[index] = campaigns[i].pledgeCost;
                pledgesNeeded[index] = campaigns[i].pledgesNeeded;
                pledgesCounts[index] = campaigns[i].pledgesCount;
                index++;
            }
        }

        return (ids, entrepreneurs, temptitles, pledgeCosts, pledgesNeeded, pledgesCounts);
    }

    function getFulfilledCampaigns() external view returns (uint[] memory, address[] memory, string[] memory, uint[] memory, uint[] memory, uint[] memory) {
        uint completedCount;
        for (uint i = 1; i <= campaignCount; i++) {
            if (campaigns[i].fulfilled) {
                completedCount++;
            }
        }

        uint[] memory ids = new uint[](completedCount);
        address[] memory entrepreneurs = new address[](completedCount);
        string[] memory temptitles = new string[](completedCount);
        uint[] memory pledgeCosts = new uint[](completedCount);
        uint[] memory pledgesNeeded = new uint[](completedCount);
        uint[] memory pledgesCount = new uint[](completedCount);

        uint index;
        for (uint i = 1; i <= campaignCount; i++) {
            if (campaigns[i].fulfilled) {
                ids[index] = campaigns[i].id;
                entrepreneurs[index] = campaigns[i].entrepreneur;
                temptitles[index] = campaigns[i].title;
                pledgeCosts[index] = campaigns[i].pledgeCost;
                pledgesNeeded[index] = campaigns[i].pledgesNeeded;
                pledgesCount[index] = campaigns[i].pledgesCount;
                index++;
            }
        }
        return (ids, entrepreneurs, temptitles, pledgeCosts, pledgesNeeded,pledgesCount);
    }

    function getCancelledCampaigns() external view returns (uint[] memory, address[] memory, string[] memory, uint[] memory, uint[] memory, uint[] memory) {
        
        uint cancelledCount;
        for (uint i = 1; i <= campaignCount; i++) {
            if (campaigns[i].cancelled) {
                cancelledCount++;
            }
        }

        uint[] memory ids = new uint[](cancelledCount);
        address[] memory entrepreneurs = new address[](cancelledCount);
        string[] memory temptitles = new string[](cancelledCount);
        uint[] memory pledgeCosts = new uint[](cancelledCount);
        uint[] memory pledgesNeeded = new uint[](cancelledCount);
        uint[] memory pledgesCounts = new uint[](cancelledCount);

        uint index;
        for (uint i = 1; i <= campaignCount; i++) {
            if (campaigns[i].cancelled) {
                ids[index] = campaigns[i].id;
                entrepreneurs[index] = campaigns[i].entrepreneur;
                temptitles[index] = campaigns[i].title;
                pledgeCosts[index] = campaigns[i].pledgeCost;
                pledgesNeeded[index] = campaigns[i].pledgesNeeded;
                pledgesCounts[index] = campaigns[i].pledgesCount;
                index++;
            }
        }

        return (ids, entrepreneurs, temptitles, pledgeCosts, pledgesNeeded, pledgesCounts);
    }

    function getowner() public view returns (address) {
        return owner;
    }
    function changeOwner(address newOwner) external onlyOwner validNewOwner(newOwner) {
        owner = newOwner;
    }
    function getContractBalance() public view returns (uint) {
        return address(this).balance;
    }
    function getBackerPledges(uint id, address user) external view returns (uint) {
        return campaigns[id].backersPledges[user];
    }
    function getBannedEntrepreneurs() external view returns (address[] memory) {
        return bannedEntrepreneursList;
    }
    function getTotalFeesAccumulated() public view returns (uint) {
        return totalFeesAccumulated;
    }

    function banEntrepreneur(address entrepreneur) external onlyOwner alreadyBanned(entrepreneur) {
        bannedEntrepreneurs[entrepreneur] = true;
        bannedEntrepreneursList.push(entrepreneur);

        for (uint i = 1; i <= campaignCount; i++) {
            Campaign storage campaign = campaigns[i];

            if (campaign.entrepreneur == entrepreneur && !campaign.cancelled) {
                campaign.cancelled = true;
                campaign.withdraw = true; // Allow refunds
                emit CampaignCancelled(entrepreneur, campaign.id);
            }
        }
    }

    function destroyContract() external onlyOwner {
        // Mark contract as damaged
        destroyed = true;

        uint totalFees;

        // Cancel any active campaigns and accumulate fees
        for (uint i = 1; i <= campaignCount; i++) {
            Campaign storage campaign = campaigns[i];

            if (!campaign.cancelled && !campaign.fulfilled) {
                campaign.cancelled = true;
                campaign.withdraw = true; 
                emit CampaignCancelled(campaign.entrepreneur, campaign.id);
            }

            
            if (!campaign.feeWithdrawn) {
                totalFees += campaignFee;       
                campaign.feeWithdrawn = true;   // Mark as withdrawn
            }

            if (campaign.fulfilled && campaign.withdraw) {
                uint reservationFee = (campaign.pledgeCost * campaign.pledgesCount * reservationFeePercentage) / 100;
                totalFees += reservationFee;
                campaign.withdraw = false;  // Mark as withdrawn so we don't double-charge
            }
        }

        if (totalFees > 0) {
            payable(owner).transfer(totalFees);
        }

        emit ContractDestroyed(owner, totalFees);
    }
}