import { Component } from 'preact';
import DashbordSettings from './DashbordSettings';
import Auth from '../../api/Auth';
import update from 'immutability-helper';
import linkState from 'linkstate';

class DashboarSettingsPage extends Component {
  
  state = {
    currentTab: 'sessions'
  };

  changeTab = (e) => {
    e.preventDefault();
    this.setState({ currentTab: e.target.getAttribute('data-target') });
    
    if (e.target.getAttribute('data-target') === 'billing') {
      this.loadStripe();
    }
  };

  connected = (e) => {
    Auth.getDevices()
      .then((devices) => this.setState({ devices }));
    
    Auth.getInvoices()
      .then((invoices) => this.setState({ invoices }));
    
    this.refreshCard();
  };

  refreshCard = () => {
    Auth.getCard()
      .then((card) => this.setState({ card }));
  };

  revokeDevice = (deviceId, index) => {
    Auth.revokeDevice(deviceId)
      .then(() => {
        
        const newState = update(this.state, {
          devices: { $splice: [[index, 1]] }
        });

        this.setState(newState);
      });
  };

  loadStripe = () => {
    if (this.state.stripeLoaded) {
      return;
    }

    // we load the script script
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    document.body.appendChild(script);

    script.onload = () => {
      this.setState({ stripeLoaded: true });
    };
  };

  saveBillingInformations = (stripeToken) => {
    
    // if no stripe token is passed, error
    if (!stripeToken) {
      return this.setState({ savingBillingError: true, paymentInProgress: false });
    }

    Auth.updateCard(stripeToken.id)
      .then(() => this.setState({ savingBillingError: false, paymentInProgress: false }))
      .then(() => this.refreshCard())
      .catch(() => this.setState({ savingBillingError: true, paymentInProgress: false }));
  };

  cancelMonthlySubscription = () => {

    Auth.cancelMonthlyPlan()
      .then(() => this.refreshCard())
      .then(() => this.setState({ cancelMonthlySubscriptionSuccess: true, cancelMonthlySubscriptionError: false }))
      .catch(() => this.setState({ cancelMonthlySubscriptionError: true }));
  };

  reSubcribeMonthlyPlan = () => {

    Auth.reSubcribeMonthlyPlan()
      .then(() => this.refreshCard())
      .then(() =>  this.setState({ reSubscribeMonthlyPlanError: false }))
      .catch(() =>  this.setState({ reSubscribeMonthlyPlanError: true }));
  };

  render({}, { currentTab, devices, stripeLoaded, userCardName, card, cancelMonthlySubscriptionError, cancelMonthlySubscriptionSuccess, reSubscribeMonthlyPlanError, invoices }) {
    return (
      <DashbordSettings
        connected={this.connected}
        currentTab={currentTab}
        changeTab={this.changeTab}
        revokeDevice={this.revokeDevice}
        devices={devices}
        stripeLoaded={stripeLoaded}
        userCardName={userCardName}
        updateUserCardName={linkState(this, 'userCardName')}
        saveBillingInformations={this.saveBillingInformations}
        cancelMonthlySubscription={this.cancelMonthlySubscription}
        cancelMonthlySubscriptionError={cancelMonthlySubscriptionError}
        cancelMonthlySubscriptionSuccess={cancelMonthlySubscriptionSuccess}
        reSubcribeMonthlyPlan={this.reSubcribeMonthlyPlan}
        reSubscribeMonthlyPlanError={reSubscribeMonthlyPlanError}
        invoices={invoices}
        card={card}
      />
    );
  }
}

export default DashboarSettingsPage;
