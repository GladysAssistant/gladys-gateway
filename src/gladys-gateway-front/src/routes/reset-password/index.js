import { Component } from 'preact';
import linkState from 'linkstate';
import ResetPassword from './ResetPassword';
import Auth from '../../api/Auth';

class ResetPasswordPage extends Component {
  
  state = {
    password: '',
    passwordRepeat: '',
    twoFactorEnabled: null,
    success: false
  };

  resetPassword = async (e) => {
    e.preventDefault();
    
    if (this.state.password !== this.state.passwordRepeat) {
      return this.setState({ passwordNotMatching: true });
    }

    if (this.state.password.length < 8) {
      return this.setState({ passwordError: true, passwordNotMatching: false });
    }

    this.setState({ passwordError: false, passwordNotMatching: false });

    try {
      let user = await Auth.getResetPasswordEmail(this.props.token);
      if (user.two_factor_enabled === true && this.state.twoFactorEnabled === null) {
        this.setState({ twoFactorEnabled: true });
      } else {
        await Auth.resetPassword(user.email, this.state.password, this.props.token, this.state.twoFactorCode);
        this.setState({ success: true });
      }
    } catch (e) {
      this.setState({ errorLink: true });
    }
  };


  render({}, { password, success, errorLink, twoFactorEnabled, passwordRepeat, twoFactorCode, passwordError, passwordNotMatching }) {
    return (
      <ResetPassword
        password={password}
        updatePassword={linkState(this, 'password')}
        resetPassword={this.resetPassword}
        success={success}
        errorLink={errorLink}
        passwordError={passwordError}
        passwordNotMatching={passwordNotMatching}
        twoFactorEnabled={twoFactorEnabled}
        twoFactorCode={twoFactorCode}
        updateTwoFactorCode={linkState(this, 'twoFactorCode')}
        passwordRepeat={passwordRepeat}
        updatePasswordRepeat={linkState(this, 'passwordRepeat')}
      />
    );
  }
}

export default ResetPasswordPage;
