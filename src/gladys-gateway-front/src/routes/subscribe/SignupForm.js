import { StripeProvider, Elements } from 'react-stripe-elements';
import MyStoreCheckout from './MyStoreCheckout';
import config from '../../../config';
import translate from './translate';

const SignupForm = ({ children, ...props }) => (
  <form className="card" style={{ height: '100%' }}>
    <div className="card-body p-6">
      <div className="card-title">{translate(props.language, 'register-community-package-title')}</div>
      
      {props.accountAlreadyExist && (
        <div class="alert alert-danger" role="alert">
          {translate(props.language, 'email-already-exist')}
        </div>
      )}

      {props.paymentFailed && (
        <div class="alert alert-danger" role="alert">
          {translate(props.language, 'payment-failed')}
        </div>
      )}

      {props.paymentSuccess &&
        <div class="alert alert-success" role="alert">
          {translate(props.language, 'payment-success')}
        </div>
      }

      { !props.paymentSuccess &&
      <div>
        <div className="form-group">
          <label className="form-label">{translate(props.language, 'email-address')}</label>
          <input
            type="email"
            className={'form-control ' + (props.emailErrored ? 'is-invalid' : '')}
            placeholder={translate(props.language, 'email-address-placeholder')}
            value={props.email}
            onInput={props.updateEmail}
          />
          <div class="invalid-feedback">{translate(props.language, 'invalid-email-address')}</div>
        </div>
        <StripeProvider apiKey={config.stripeApiKey}>
          <Elements>
            <MyStoreCheckout language={props.language}
              subscribeToPlan={props.subscribeToPlan}
              updateRequestPending={props.updateRequestPending}
              requestPending={props.requestPending}
              updatePaymentFailed={props.updatePaymentFailed}
            />
          </Elements>
        </StripeProvider>
      </div>
      }
    </div>
  </form>
);

export default SignupForm;
