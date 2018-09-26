import { Component } from 'preact';
import SetupContainer from './SetupContainer';

class SetupPage extends Component {
  state = {
    email: '',
    password: '',
    stripeLoaded: false,
    step: 4
  };

  saveBillingInformations = stripeToken => {
    this.setState({ step: 2 });
  };

  componentDidMount = () => {
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

  render({}, { stripeLoaded, step }) {
    return (
      <SetupContainer
        stripeLoaded={stripeLoaded}
        step={step}
        saveBillingInformations={this.saveBillingInformations}
      />
    );
  }
}

export default SetupPage;
