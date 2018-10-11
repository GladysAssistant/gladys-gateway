import { Component } from 'preact';
import linkState from 'linkstate';
import ForgotPassword from './ForgotPassword';

class ForgotPasswordPage extends Component {
  state = {
    email: ''
  };

  render({}, { email, password }) {
    return <ForgotPassword email={email} updateEmail={linkState(this, 'email')} />;
  }
}

export default ForgotPasswordPage;
