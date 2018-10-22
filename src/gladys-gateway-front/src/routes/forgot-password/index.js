import { Component } from 'preact';
import linkState from 'linkstate';
import ForgotPassword from './ForgotPassword';
import Auth from '../../api/Auth';

class ForgotPasswordPage extends Component {
  
  state = {
    email: '',
    forgotInProgress: false
  };

  sendResetPasswordLink = (e) => {
    e.preventDefault();
    this.setState({ forgotInProgress: true });
    Auth.forgotPassword(this.state.email)
      .then(() => this.setState({ success: true, forgotInProgress: false }))
      .catch(() => this.setState({ success: true, forgotInProgress: false }));
  };

  render({}, { email, password, success, forgotInProgress }) {
    return <ForgotPassword email={email} updateEmail={linkState(this, 'email')} sendResetPasswordLink={this.sendResetPasswordLink} success={success} forgotInProgress={forgotInProgress} />;
  }
}

export default ForgotPasswordPage;
