import { CardElement, injectStripe } from 'react-stripe-elements';
import { Component } from 'preact';

class MyStoreCheckout extends Component {
  submitCard = ev => {
    // We don't want to let default form submission happen here, which would refresh the page.
    ev.preventDefault();

    // Within the context of `Elements`, this call to createToken knows which Element to
    // tokenize, since there's only one in this group.
    this.props.stripe.createToken({ name: this.props.userCardName }).then(({ token }) => {
      this.props.saveBillingInformations(token);
    });
  };

  render({}, {}) {
    return (
      <form onSubmit={this.submitCard}>
        <input
          type="text"
          class="form-control"
          value={this.props.userCardName}
          onInput={this.props.updateUserCardName}
          placeholder="Name on card"
          style={{ marginBottom: '20px' }}
        />
        <CardElement />
        <br />
        <label>
          🔒 Payment secured by <a href="https://stripe.com/docs/security/stripe">Stripe</a>
        </label>
        <button class="btn btn-primary btn-block" style={{ marginTop: '15px' }}>
          9.99€/month
        </button>
      </form>
    );
  }
}

export default injectStripe(MyStoreCheckout);
