import { Component } from 'preact';
import linkState from 'linkstate';
import ForgotPassword from './ForgotPassword';
import Auth from '../../api/Auth';

class ForgotPasswordPage extends Component {
  
  state = {
    email: ''
  };

  sendResetPasswordLink = (e) => {
    e.preventDefault();
    Auth.forgotPassword(this.state.email)
      .then(() => this.setState({ success: true }))
      .catch(() => this.setState({ success: true }));
  };

  render({}, { email, password, success }) {
    return <ForgotPassword email={email} updateEmail={linkState(this, 'email')} sendResetPasswordLink={this.sendResetPasswordLink} success={success} />;
  }
}

export default ForgotPasswordPage;
