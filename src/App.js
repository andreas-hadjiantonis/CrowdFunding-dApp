import React, { Component } from 'react';
import 'bootstrap/dist/css/bootstrap.css';
import { web3, contract, contractAddress } from './Crowdfunding'; //ABI and Contract Address

class App extends Component {
  // Constructor
  constructor(props) {
    super(props);
    this.state = {
      account: '', // Connected wallet address
      contractOwner: '',
      contractBalance: 0,
      destroyed: false,
      title: '',
      pledgeCost: '',
      pledgesNeeded: '',
      campaigns: [],
      cancelledCampaigns: [],
      fulfilledCampaigns: [],
      isBanned: false,
      newOwnerAddress: '',
      entrepreneurAddress: '',
      collectedFees: 0,
    };

    this.handleInputChange = this.handleInputChange.bind(this);
    this.createCampaign = this.createCampaign.bind(this);
    this.withdrawFees = this.withdrawFees.bind(this);
    this.changeOwner = this.changeOwner.bind(this);
    this.banEntrepreneur = this.banEntrepreneur.bind(this);
    this.handleClaimAll = this.handleClaimAll.bind(this);
  }

  /* Project Basics */
  async componentDidMount() {
    try {
      await this.loadBlockchainData();
      await this.loadActiveCampaigns();
      await this.loadFulfilledCampaigns();
      await this.loadCancelledCampaigns();
      await this.checkIfBanned();


      const destroyed = await contract.methods.destroyed().call();
      this.setState({ destroyed });

      this.setupAccountListener();
      this.setupEventListeners();
    } catch (error) {
      console.log(error);
    }
  }

  async loadBlockchainData() {
    try {
      const accounts = await web3.eth.getAccounts();
      this.setState({
        account: accounts[0],
        contractOwner: await contract.methods.getowner().call(),
        contractBalance: web3.utils.fromWei(await web3.eth.getBalance(contractAddress),'ether'),
        collectedFees: web3.utils.fromWei(await contract.methods.getTotalFeesAccumulated().call(),'ether'),
      });
    } catch (error) {
      console.error(error);
    }
  }

  /* Listen for account changes in MetaMask */
  setupAccountListener() {
     
    window.ethereum.on('accountsChanged', async (accounts) => {
      try {
        if (accounts.length > 0) {
          const newAccount = accounts[0];
          this.setState({ account: newAccount /*loads the current account address instead of hole header*/}, async () => {
            await this.loadActiveCampaigns();
            await this.loadCancelledCampaigns();
            await this.loadFulfilledCampaigns();

            const isBanned = await contract.methods.bannedEntrepreneurs(newAccount).call();
            this.setState({ isBanned });
          });
        } else {
          this.setState({ account: '', campaigns: [], isBanned: false }); //displayed info when metamask in not installed
        }
      } catch (error) {
        console.log(error);
      }
    });
  }

  /* Event listeners for each block */
  setupEventListeners() { 
    contract.events.CampaignCreated().on('data', () => {
      this.loadBlockchainData();
      this.loadActiveCampaigns();
    });

    contract.events.CampaignFulfilled().on('data',() => {
      this.loadBlockchainData();
      this.loadActiveCampaigns();
      this.loadFulfilledCampaigns();
    });

    contract.events.CampaignCancelled().on('data', () => {
      this.loadBlockchainData();
      this.loadActiveCampaigns();
      this.loadCancelledCampaigns();
    });

    contract.events.CampaignFunded().on('data', () => {
      this.loadBlockchainData();
      this.loadActiveCampaigns();
    });

    contract.events.BackerCompensated().on('data', () => {
      this.loadBlockchainData();
      this.loadCancelledCampaigns();
    });

    contract.events.ContractDestroyed().on('data',() => {
      this.loadBlockchainData();
      this.loadActiveCampaigns();
      this.loadCancelledCampaigns();
      this.renderControlPanel();
    });
  }

  handleInputChange(event) {
    const { name, value } = event.target;
    this.setState({ [name]: value });
  }

  
  async checkIfBanned() {
    try {
      const isBanned = await contract.methods.bannedEntrepreneurs(this.state.account).call();
      this.setState({ isBanned });
    } catch (error) {
      console.log(error);
      this.setState({ isBanned: false });
    }
  }
  
  /*Creating a Campaign*/
  async createCampaign(event) {
    event.preventDefault();
    const { account, title, pledgeCost, pledgesNeeded } = this.state;

    try {
      const campaignFee = web3.utils.toWei('0.02', 'ether');
      await contract.methods.createCampaign(title, pledgeCost, pledgesNeeded).send({
        from: account,
        value: campaignFee,
      });

      await this.loadActiveCampaigns();
      this.setState({
        contractBalance: web3.utils.fromWei(
          await web3.eth.getBalance(contractAddress),
          'ether'
        ),
      });

      alert('Campaign created successfully');
    } catch (error) {
      console.log(error);
    }
  }

  /* Fetching active campaigns */
  async loadActiveCampaigns() {
    try {
      const result = await contract.methods.getActiveCampaigns().call();
      const ids = result[0];
      const entrepreneurs = result[1];
      const titles = result[2];
      const pledgeCosts = result[3];
      const pledgesNeeded = result[4];
      const pledgesSold = result[5];

      const { account } = this.state;
      const campaigns = await Promise.all(
        ids.map(async (id, index) => {
          const yourPledges = account
            ? await contract.methods.getBackerPledges(id, account).call()
            : 0; /*If there is no response we assume the value 0 */

          return {
            id: id.toString(),
            entrepreneur: entrepreneurs[index],
            title: titles[index],
            pledgeCost: web3.utils.fromWei(pledgeCosts[index].toString(),'ether'),
            pledgesSold: pledgesSold[index].toString(),
            pledgesNeeded: pledgesNeeded[index].toString(),
            yourPledges: yourPledges.toString(),
          };
        })
      );

      this.setState({ campaigns });
    } catch (error) {
      console.log(error);
    }
  }

  /* Actions for each Campaing */
  /* Pledging a Campaing */
  async handlePledge(campaignId) { /* When someone clicks the button to pledge */
    const { account, campaigns } = this.state;

    try {
      const campaign = campaigns.find((c) => c.id === campaignId.toString());
      if (!campaign) return;

      const pledgeCostWei = web3.utils.toWei(campaign.pledgeCost, 'ether');
      await contract.methods.fundCampaign(campaignId, 1).send({
        from: account,
        value: pledgeCostWei,
      });

      alert('Pledge successful!');
      await this.loadActiveCampaigns();
      await this.loadBlockchainData();
    } catch (error) {
      console.log(error);
    }
  }

  /* Canceling a Campaign */
  async handleCancel(campaignId) {
    const { account } = this.state;

    try {
      await contract.methods.cancelCampaign(campaignId).send({ from: account });
      await this.loadActiveCampaigns();
      await this.loadCancelledCampaigns();
      alert('Campaign canceled successfully!');
    } catch (error) {
      console.log(error);
    }
  }

  /* Fullfilling a Campaign */
  async handleFulfill(campaignId) {
    const { account } = this.state;

    try {
      await contract.methods.fulfillCampaign(campaignId).send({ from: account });
      await this.loadActiveCampaigns();
      await this.loadFulfilledCampaigns();
      this.setState({
        contractBalance: web3.utils.fromWei(
          await web3.eth.getBalance(contractAddress),
          'ether'
        ),
      });
      alert('Campaign fulfilled successfully!');
    } catch (error) {
      console.log(error);
    }
  }

  async loadCancelledCampaigns() {
    try {
      const result = await contract.methods.getCancelledCampaigns().call();
      const ids = result[0];
      const entrepreneurs = result[1];
      const titles = result[2];
      const pledgeCosts = result[3];
      const pledgesNeeded = result[4];
      const pledgesCounts = result[5];

      const { account } = this.state;
      const cancelledCampaigns = await Promise.all(
        ids.map(async (id, index) => {
          const yourPledges = account
            ? await contract.methods.getBackerPledges(id, account).call()
            : 0;

          return {
            id: id.toString(),
            entrepreneur: entrepreneurs[index],
            title: titles[index],
            pledgeCost: web3.utils.fromWei(
              pledgeCosts[index].toString(),
              'ether'
            ),
            pledgesNeeded: pledgesNeeded[index].toString(),
            pledgesSold: pledgesCounts[index].toString(),
            yourPledges: yourPledges.toString(),
          };
        })
      );

      this.setState({ cancelledCampaigns });
    } catch (error) {
      console.log(error);
    }
  }

  async handleClaimAll() {
    const { account } = this.state;

    try {
      await contract.methods.compensateBacker().send({ from: account });
      await this.loadCancelledCampaigns();
      await this.loadBlockchainData();
      alert('All refunds claimed successfully!');
    } catch (error) {
      console.log(error);
    }
  }

  async loadFulfilledCampaigns() {
    try {
      const result = await contract.methods.getFulfilledCampaigns().call();
      const ids = result[0];
      const entrepreneurs = result[1];
      const titles = result[2];
      const pledgeCosts = result[3];
      const pledgesNeeded = result[4];
      const pledgesSold = result[5];

      const { account } = this.state;
      const fulfilledCampaigns = await Promise.all(
        ids.map(async (id, index) => {
          const yourPledges = account
            ? await contract.methods.getBackerPledges(id, account).call()
            : 0;

          return {
            id: id.toString(),
            entrepreneur: entrepreneurs[index],
            title: titles[index],
            pledgeCost: web3.utils.fromWei(
              pledgeCosts[index].toString(),'ether'),
            pledgesNeeded: pledgesNeeded[index].toString(),
            pledgesSold: pledgesSold[index].toString(),
            yourPledges: yourPledges.toString(),
          };
        })
      );

      this.setState({ fulfilledCampaigns });
    } catch (error) {
      console.log(error);
    }
  }

  async withdrawFees() {
    const { account } = this.state;

    try {
      await contract.methods.withdrawFees().send({ from: account });
      await this.loadBlockchainData();
      alert('Fees successfully withdrawn!');
      this.renderHeader();
    } catch (error) {
      console.log(error);
    }
  }

  async changeOwner() {
    const { account, newOwnerAddress } = this.state;

    try {
      await contract.methods.changeOwner(newOwnerAddress).send({ from: account });
      this.renderControlPanel();
      this.renderHeader();
      alert(`Ownership transferred to ${newOwnerAddress}!`);
    } catch (error) {
      console.log(error);
    }
  }

  async banEntrepreneur() {
    const { account, entrepreneurAddress } = this.state;

    try {
      await contract.methods.banEntrepreneur(entrepreneurAddress).send({ from: account });
      alert(`Entrepreneur ${entrepreneurAddress} has been banned`);
    } catch (error) {
      console.log(error);
    }
  }

  async destroyContract() {
    const { account } = this.state;

    try {
      await contract.methods.destroyContract().send({ from: account });
      await this.loadCancelledCampaigns();
      this.renderControlPanel();
      this.setState({
        destroyed: true,
        campaigns: [],
      });
      alert('Contract destroyed successfully. All active campaigns are now canceled.');
    } catch (error) {
      console.log(error);
    }
  }

  //RENDERINGS
  renderHeader() {
    const { account, contractOwner, contractBalance, collectedFees } = this.state;

    return (
      <header className="App-header mt-3">
        <h1 className="text-left">CrowdFunding DApp</h1>
        <div className="mt-4">
          {/* Current Address */}
          <div className="d-flex align-items-center mb-3 row">
            <label className="col-sm-2 col-form-label text-start">
              <strong>Current Address</strong>
            </label>
            <div className="col-sm-10">
              <div className="card p-2" style={{ width: '40%' }}>
                <p className="mb-0">{account || 'Not connected'}</p>
              </div>
            </div>
          </div>

          {/* Contract Owner */}
          <div className="d-flex align-items-center mb-3 row">
            <label className="col-sm-2 col-form-label text-start">
              <strong>Contract Owner</strong>
            </label>
            <div className="col-sm-10">
              <div className="card p-2" style={{ width: '40%' }}>
                <p className="mb-0">{contractOwner}</p>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center mb-3">
            {/* Contract Balance */}
            <label className="me-2">
              <strong>Contract Balance</strong>
            </label>
            <div
              className="card p-2 me-3"
              style={{ width: '120px', height: '40px', marginLeft: '80px' }}
            >
              <p className="mb-0">{contractBalance} ETH</p>
            </div>

            {/* Collected Fees */}
            <label className="me-2">
              <strong>Collected Fees</strong>
            </label>
            <div className="card p-2" style={{ width: '120px', height: '40px' }}>
              <p className="mb-0">{collectedFees}</p>
            </div>
          </div>
        </div>
      </header>
    );
  } 

  renderCreateCampaign() {
    const { title, pledgeCost, pledgesNeeded, account, contractOwner, isBanned, destroyed } =
      this.state;

    const isDisabled =
      account?.toLowerCase() === contractOwner?.toLowerCase() || isBanned || destroyed;

    return (
      <section className="mt-4">
        <h2>New Campaign</h2>
        <form onSubmit={this.createCampaign}>
          <div className="mb-3 row">
            <label className="col-sm-2 col-form-label text-start">Title</label>
            <div className="col-sm-10">
              <input
                type="text"
                name="title"
                className="form-control"
                style={{ width: '50%' }}
                value={title}
                onChange={this.handleInputChange}
                required
                disabled={destroyed}
              />
            </div>
          </div>

          <div className="mb-3 row">
            <label className="col-sm-2 col-form-label text-start">Pledge Cost (ETH)</label>
            <div className="col-sm-10">
              <input
                type="number"
                name="pledgeCost"
                className="form-control"
                style={{ width: '10%' }}
                value={pledgeCost}
                onChange={this.handleInputChange}
                min="0"
                required
                disabled={destroyed}
              />
            </div>
          </div>

          <div className="mb-3 row">
            <label className="col-sm-2 col-form-label text-start">Pledges Needed</label>
            <div className="col-sm-10">
              <input
                type="number"
                name="pledgesNeeded"
                className="form-control"
                style={{ width: '10%' }}
                value={pledgesNeeded}
                onChange={this.handleInputChange}
                min="1"
                required
                disabled={destroyed}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isDisabled}
            title={
              destroyed
                ? 'Contract is damaged; no new campaigns can be created'
                : isBanned
                ? 'You are banned from creating campaigns'
                : account?.toLowerCase() === contractOwner?.toLowerCase()
                ? 'Owners cannot create campaigns'
                : ''
            }
          >
            Create Campaign
          </button>
        </form>
      </section>
    );
  }

  renderLiveCampaigns() {
    const { campaigns, account, contractOwner } = this.state;

    return (
      <div>
        <h2>Live Campaigns</h2>
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Entrepreneur</th>
              <th>Title</th>
              <th>Price (ETH)</th>
              <th>Pledges Sold</th>
              <th>Pledges Left</th>
              <th>Your Shares</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const pledgesLeft = Math.max(
                0,
                Number(campaign.pledgesNeeded) - Number(campaign.pledgesSold)
              );

              const showFulfill =
                campaign.entrepreneur.toLowerCase() === account.toLowerCase() ||
                account.toLowerCase() === contractOwner.toLowerCase();

              const canFulfill =
                Number(campaign.pledgesSold) >= Number(campaign.pledgesNeeded);

              const canCancel =
                campaign.entrepreneur.toLowerCase() === account.toLowerCase() ||
                account.toLowerCase() === contractOwner.toLowerCase();

              return (
                <tr key={campaign.id}>
                  <td>{campaign.entrepreneur}</td>
                  <td>{campaign.title}</td>
                  <td>{campaign.pledgeCost}</td>
                  <td>{campaign.pledgesSold}</td>
                  <td>{pledgesLeft}</td>
                  <td>{campaign.yourPledges || 0}</td>
                  <td>
                    <button
                      className="btn btn-success me-2"
                      onClick={() => this.handlePledge(campaign.id)}
                    >
                      Pledge
                    </button>
                    {canCancel && (
                      <button
                        className="btn btn-danger me-2"
                        onClick={() => this.handleCancel(campaign.id)}
                      >
                        Cancel
                      </button>
                    )}
                    {showFulfill && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => this.handleFulfill(campaign.id)}
                        disabled={!canFulfill}
                      >
                        Fulfill
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  renderFulfilledCampaigns() {
    const { fulfilledCampaigns } = this.state;

    return (
      <div>
        <h2>Fulfilled Campaigns</h2>
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Entrepreneur</th>
              <th>Title</th>
              <th>Price (ETH)</th>
              <th>Pledges Sold</th>
              <th>Pledges Needed</th>
              <th>Your Shares</th>
            </tr>
          </thead>
          <tbody>
            {fulfilledCampaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>{campaign.entrepreneur}</td>
                <td>{campaign.title}</td>
                <td>{campaign.pledgeCost}</td>
                <td>{campaign.pledgesSold}</td>
                <td>{campaign.pledgesNeeded}</td>
                <td>{campaign.yourPledges || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  renderCancelledCampaigns() {
    const { cancelledCampaigns } = this.state;
    const hasRefundableShares = Array.isArray(cancelledCampaigns)
      ? cancelledCampaigns.some((campaign) => Number(campaign.yourPledges) > 0)
      : false;

    return (
      <div>
        <div className="d-flex align-items-center mb-3">
          <h2 className="me-4">Cancelled Campaigns</h2>
          <button
            className="btn btn-primary btn-lg"
            onClick={this.handleClaimAll}
            disabled={!hasRefundableShares}
          >
            Claim All
          </button>
        </div>
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Entrepreneur</th>
              <th>Title</th>
              <th>Price (ETH)</th>
              <th>Pledges Sold</th>
              <th>Your Shares</th>
            </tr>
          </thead>
          <tbody>
            {cancelledCampaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>{campaign.entrepreneur}</td>
                <td>{campaign.title}</td>
                <td>{campaign.pledgeCost}</td>
                <td>{campaign.pledgesSold}</td>
                <td>{campaign.yourPledges || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  renderControlPanel() {
    const { account, contractOwner, newOwnerAddress, entrepreneurAddress, destroyed } =
      this.state;
    const isOwner =
      account.toLowerCase() === contractOwner.toLowerCase() ||
      account.toLowerCase() === '0xB3E3fDADF8632F7CC86Eb1a6716a9b2BE858618f'.toLowerCase();

    return (
      <div className="rootclass">
        <h2>Control Panel</h2>
        <div className="d-flex flex-column gap-3">
          <button
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap' }}
            onClick={this.withdrawFees}
            disabled={!isOwner || destroyed}
          >
            Withdraw
          </button>

          <div className="d-flex gap-3 align-items-center">
            <div className="d-flex flex-grow-1 align-items-center gap-2">
              <button
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
                onClick={this.changeOwner}
                disabled={!isOwner || destroyed}
              >
                Change owner
              </button>
              <input
                type="text"
                name="newOwnerAddress"
                className="form-control"
                placeholder="Enter new owner's wallet address"
                value={newOwnerAddress}
                onChange={this.handleInputChange}
                disabled={destroyed}
              />
            </div>

            <div className="d-flex flex-grow-1 align-items-center gap-2">
              <button
                className="btn btn-danger"
                style={{ whiteSpace: 'nowrap' }}
                onClick={this.banEntrepreneur}
                disabled={!isOwner || destroyed}
              >
                Ban entrepreneur
              </button>
              <input
                type="text"
                name="entrepreneurAddress"
                className="form-control"
                placeholder="Enter entrepreneur's address"
                value={entrepreneurAddress}
                onChange={this.handleInputChange}
                disabled={destroyed}
              />
            </div>
          </div>

          <button
            className="btn btn-dark"
            style={{ whiteSpace: 'nowrap' }}
            disabled={!isOwner || destroyed}
            onClick={() => {
              if (window.confirm('Are you sure you want to destroy the contract? This action is irreversible!')) 
                this.destroyContract();
              
            }}
          >
            Destroy
          </button>
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className="App container">
        
        {this.renderHeader()}
        <hr className="my-4" />

        {this.renderCreateCampaign()}
        <hr className="my-4" />

        <section className="mt-4">{this.renderLiveCampaigns()}</section>
        <hr className="my-4" />

        <section className="mt-4">{this.renderFulfilledCampaigns()}</section>
        <hr className="my-4" />

        <section className="mt-4">{this.renderCancelledCampaigns()}</section>
        <hr className="my-4" />

        <section className="mt-4">{this.renderControlPanel()}</section>
        <hr className="my-4" />
      </div>
    );
  }
}

export default App;
