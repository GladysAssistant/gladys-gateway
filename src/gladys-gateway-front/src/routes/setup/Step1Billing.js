import { StripeProvider, Elements } from 'react-stripe-elements';
import MyStoreCheckout from './MyStoreCheckout';
import style from './style.css';
import config from '../../../config';

const Step1Billing = ({ children, ...props }) => (
  <div class={'row ' + style.equal}>
    <div class="col-md">
      <div class="" style={{ height: '100%' }}>
        <div class="card-body">
          <h3 class="card-title">Why is the Gladys Gateway not free?</h3>

          <p class="card-text">
            My name is <a href="">Pierre-Gilles Leymarie</a>, I'm an indie maker, and I'm working on
            this open-source project Gladys since 2013, for completely free 👨‍💻
          </p>

          <p>
            The Gladys Gateway is the first product on Gladys that is hosted online. It means that
            each month, I have to pay servers to make this product run.
          </p>
          <p>
            This product respects your privacy: Everything is end-to-end encrypted, I'm not selling
            any of your data (since I don't see it), I'm not putting ads, I'm not spying on you.
          </p>
          <p>
            Asking for money is my only way to make this product sustainable, to pay my rent and
            have something to eat at the end of the day 😋
          </p>

          <p>Thanks for your support 🙏</p>
        </div>
      </div>
    </div>

    <div class="col-md">
      <div class="" style={{ height: '100%' }}>
        <div class="card-body">
          <div class="card-title">Please enter your credit card informations</div>
          <StripeProvider apiKey={config.stripeApiKey}>
            <Elements>
              <MyStoreCheckout saveBillingInformations={props.saveBillingInformations} />
            </Elements>
          </StripeProvider>
        </div>
        <ul class="list-group card-list-group">
          <li class="list-group-item">
            <i class="fe fe-check text-success mr-2" aria-hidden="true" />
            <b>Unlimited</b> users in your family
          </li>
          <li class="list-group-item">
            <i class="fe fe-check text-success mr-2" aria-hidden="true" />
            <b>End-to-End encryption</b> between your Gladys and you
          </li>
          <li class="list-group-item">
            <i class="fe fe-check text-success mr-2" aria-hidden="true" />
            <b>Open-Source</b> code, fully on GitHub
          </li>
          <li class="list-group-item">
            <i class="fe fe-check text-success mr-2" aria-hidden="true" />
            <b>Support</b> a product made with ❤️ by an indie maker
          </li>
        </ul>
      </div>
    </div>
  </div>
);

export default Step1Billing;
