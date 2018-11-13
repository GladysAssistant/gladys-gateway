import { CardElement, injectStripe } from 'react-stripe-elements';
import { Component } from 'preact';
import translate from './translate';

class MyStoreCheckout extends Component {
  submitCard = ev => {
    // We don't want to let default form submission happen here, which would refresh the page.
    ev.preventDefault();

    this.props.updateRequestPending(true);

    // Within the context of `Elements`, this call to createToken knows which Element to
    // tokenize, since there's only one in this group.
    this.props.stripe.createToken({ email: this.props.email }).then(({ token }) => {
      this.props.subscribeToPlan(token);
    })
      .catch(() => {
        this.props.updateRequestPending(false);
      });
  };

  render({}, {}) {
    return (
      <form onSubmit={this.submitCard}>
        <label className="form-label">{translate(this.props.language, 'card-informations')}</label>
        <CardElement className="form-control" style={{
          base: {
            lineHeight: '1.6'
          }
        }}
        />
        <br />
        <label>
          🔒 {translate(this.props.language, 'payment-secured-by')} <a href="https://stripe.com/docs/security/stripe" target="_blank" rel="noopener noreferrer">Stripe</a>
        </label>
        <button className="btn btn-primary btn-block" style={{ marginTop: '15px' }} disabled={this.props.requestPending === true}>
          {translate(this.props.language, 'subscribe-button')}
        </button>
      </form>
    );
  }
}

export default injectStripe(MyStoreCheckout);
