# Smart Contract Guide – Ethereum Crowdfunding DApp

This document explains the structure, logic, and reasoning behind the Solidity smart contract developed for the Ethereum Crowdfunding DApp.

---

##  Contract Overview

The smart contract manages the lifecycle of crowdfunding campaigns, ensuring secure handling of funds and enforcing permissions. It uses mappings, structs, and events to track campaigns, user investments, and contract state.

---

##  Key Concepts

### Structs
- `Campaign`: Represents each crowdfunding campaign with metadata (creator, title, price, totalShares, etc.).
- `InvestorInfo`: Keeps track of how many shares each investor has in a campaign.

### State Variables
- `owner`: Address of the current contract owner.
- `feesCollected`: Accumulated platform fees from fulfilled campaigns.
- `bannedEntrepreneurs`: Mapping to track banned addresses.
- `campaigns`: Mapping of unique title to `Campaign` struct.
- `campaignStatus`: Enum (Live, Fulfilled, Cancelled).

### Modifiers
- `onlyOwner`: Ensures function can only be called by the contract owner.
- `notBanned`: Ensures an address is not banned.
- `onlyCampaignCreator`: Restricts function to creator of the campaign.

---

## 🔨 Functions

### Campaign Management

- `createCampaign(string title, uint price, uint totalShares)`
  - Requires 0.02 ETH payment.
  - Stores a new campaign in `campaigns` mapping.
  - Emits `CampaignCreated` event.

- `pledge(string title)`
  - Investors can pledge 1 share per call.
  - Requires payment equal to share price.
  - Updates investor mapping and campaign progress.
  - Emits `SharePurchased` event.

- `cancelCampaign(string title)`
  - Only campaign creator or owner can cancel.
  - Refunds enabled for investors.
  - Emits `CampaignCancelled` event.

- `fulfillCampaign(string title)`
  - Requires campaign to be 100% funded.
  - Transfers 80% to creator and retains 20% as platform fee.
  - Emits `CampaignFulfilled` event.

- `claimRefund(string title)`
  - Allows investors to claim refund from canceled campaigns.
  - Emits `RefundClaimed` event.

### Admin-Only

- `withdrawFees()`
  - Transfers collected fees to owner.
  - Emits `FeesWithdrawn`.

- `changeOwner(address newOwner)`
  - Transfers ownership.
  - Emits `OwnerChanged`.

- `banEntrepreneur(address badActor)`
  - Cancels all campaigns by this address.
  - Prevents further campaign creation.
  - Emits `EntrepreneurBanned`.

- `destroyContract()`
  - Cancels all campaigns.
  - Transfers remaining balance to owner.
  - Disables all future actions except refunds.
  - Emits `ContractDestroyed`.

---

## Events

- `CampaignCreated(...)`
- `SharePurchased(...)`
- `CampaignCancelled(...)`
- `CampaignFulfilled(...)`
- `RefundClaimed(...)`
- `FeesWithdrawn(...)`
- `EntrepreneurBanned(...)`
- `OwnerChanged(...)`
- `ContractDestroyed()`

These enable the frontend to listen and update UI **without polling**.

---

## ⚠️ Design Assumptions

- Campaigns are uniquely identified by title.
- One share = one pledge. No bulk purchases.
- Refunds are manual (via claim).
- Fees are 20% fixed and non-configurable.
- Owner override address (`0x153d...6477`) always has `onlyOwner` privileges, hardcoded as fallback.

---

## Deployment

- Deployed on **Sepolia** Testnet.
- ABI is bundled with frontend in `src/utils/contractABI.js`

---

For technical questions or audit purposes, refer to inline comments in `Crowdfunding.sol`.

