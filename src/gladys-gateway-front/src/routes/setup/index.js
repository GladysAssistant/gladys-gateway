import { Component } from 'preact';
import SetupContainer from './SetupContainer';
import Auth from '../../api/Auth';
import linkState from 'linkstate';
import { route } from 'preact-router';

const LATENCY_REFRESH_FREQUENCY = 5000;

class SetupPage extends Component {
  state = {
    email: '',
    password: '',
    userCardName: '',
    stripeLoaded: false,
    instanceFound: false,
    paymentInProgress: false,
    savingBillingError: false,
    instance: {},
    usersInGladys: [],
    gladysUserSelected: null,
    step: null,
    latency: '-'
  };

  saveBillingInformations = stripeToken => {
    // if no stripe token is passed, error
    if (!stripeToken) {
      return this.setState({ savingBillingError: true, paymentInProgress: false });
    }

    this.setState({ paymentInProgress: true, savingBillingError: false });

    Auth.subcribeMonthlyPlan(stripeToken.id)
      .then(() => this.activateStep2())
      .catch(err => {
        // the users already have a plan registered, so it's fine
        if (err.response && err.response.status === 409) {
          this.activateStep2();
        } else {
          this.setState({ savingBillingError: true, paymentInProgress: false });
          throw err;
        }
      });
  };

  activateStep2 = () => {
    Auth.getInstance().then(instance => {
      let instanceFound = instance !== null;
      this.setState({ step: 2, paymentInProgress: false, instance, instanceFound });
    });
  };

  activateStep3 = async () => {
    let user = await Auth.getMySelf();
    let instance = await Auth.getInstance();

    try {
      let usersInGladys = await Auth.request.get('/user');
      let gladysUserSelected = usersInGladys.length ? usersInGladys[0].id : null;
      this.setState({ step: 3, user, instance, instanceFound: true, usersInGladys, gladysUserSelected });
    } catch (err) {

      console.log(err);
      
      // in case we can't find the instance
      if (err && err.status === 404) {
        this.setState({ user, step: 3, instanceFound: false });
      }
    }
  };

  saveUserInInGladys = async () => {
    await Auth.updateUserIdInGladys(this.state.gladysUserSelected);
    this.setState({ step: 4 });
  };

  goToDashboard = () => {
    route('/dashboard');
  };

  handleNewEvent = (type, data) => {
    if (type === 'hello') {
      this.setState({ instance: data, instanceFound: true });
    }
  };

  calculateLatency = async () => {
    let latency = await Auth.calculateLatency();
    this.setState({ latency });
  };

  getCurrentSetupState = async () => {
    // we get the current setup state
    let setupState = await Auth.getSetupState();

    if (setupState.billing_setup === false) {
      return this.setState({ step: 1 });
    }

    if (setupState.gladys_instance_setup === false) {
      return this.activateStep2();
    }

    if (setupState.user_gladys_acccount_linked === false) {
      return this.activateStep3();
    }

    // if everything is configured, just go to step 4
    return this.setState({ step: 4 });
  };

  connect = async () => {

    // we connect in websocket to the gateway
    await Auth.connectSocket(this.handleNewEvent);

    // we get the current setup state to put the user in the right step
    await this.getCurrentSetupState();

    // we calculate the latency now and every INTERVAL
    this.calculateLatency();
    setInterval(this.calculateLatency, LATENCY_REFRESH_FREQUENCY);
  };

  loadStrip = () => {
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

  componentDidMount = async () => {
    await this.connect();

    // We load strip only if needed
    if (this.state.step === 1) {
      this.loadStrip();
    }
  };

  render(
    {},
    {
      stripeLoaded,
      step,
      latency,
      instanceFound,
      instance,
      user,
      userCardName,
      paymentInProgress,
      savingBillingError,
      usersInGladys,
      gladysUserSelected
    }
  ) {
    return (
      <SetupContainer
        stripeLoaded={stripeLoaded}
        updateUserCardName={linkState(this, 'userCardName')}
        userCardName={userCardName}
        step={step}
        saveBillingInformations={this.saveBillingInformations}
        latency={latency}
        instanceFound={instanceFound}
        instance={instance}
        activateStep3={this.activateStep3}
        paymentInProgress={paymentInProgress}
        savingBillingError={savingBillingError}
        usersInGladys={usersInGladys}
        updateGladysUserSelected={linkState(this, 'gladysUserSelected')}
        gladysUserSelected={gladysUserSelected}
        saveUserInInGladys={this.saveUserInInGladys}
        goToDashboard={this.goToDashboard}
        user={user}
      />
    );
  }
}

export default SetupPage;
