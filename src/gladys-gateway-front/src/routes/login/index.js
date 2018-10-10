import { Component } from 'preact';
import { route } from 'preact-router';
import linkState from 'linkstate';
import Auth from '../../api/Auth';
import LoginForm from './LoginForm';

class LoginPage extends Component {
  state = {
    email: '',
    password: '',
    displayTwoFactorInput: false,
    twoFactorCode: '',
    loginErrored: false
  };

  login = event => {
    event.preventDefault();

    Auth.login(this.state)
      .then(data => {
        if (data.two_factor_token) {
          this.setState({ displayTwoFactorInput: true, twoFactorToken: data.two_factor_token });
        } else {
          Auth.saveAccessToken(data.access_token);
          route('/configure-two-factor');
        }
      })
      .catch(err => {
        console.log(err);
        this.setState({ loginErrored: true });
      });
  };

  loginTwoFactor = event => {
    event.preventDefault();

    let twoFactorCode =  this.state.twoFactorCode.replace(/\s/g, '');

    // we login
    Auth.loginTwoFactor(this.state.twoFactorToken, this.state.password, twoFactorCode)
      
      // we save the users info
      .then((data) => Auth.saveLoginInformations(data))

      // we redirect to the dashboard
      .then(() => route('/dashboard'))

      //return Auth.request.get('/devicetype/room', {data: 'test'});
      .catch((err) => {
        console.log(err);
        this.setState({ loginErrored: true });
      });
  }

  updateTwoFactorCode = event => {
    let newValue = event.target.value;

    // we add a space between the two group of 3 digits code
    // so it's more readable
    if (newValue.length === 3) {
      if (newValue.length > this.state.twoFactorCode.length) {
        newValue += ' ';
      } else {
        newValue = newValue.substr(0, newValue.length - 1);
      }
    }
    this.setState({ twoFactorCode: newValue });
  };

  render({}, { email, password, displayTwoFactorInput, twoFactorCode }) {
    return (
      <LoginForm
        email={email}
        password={password}
        login={this.login}
        updateEmail={linkState(this, 'email')}
        updatePassword={linkState(this, 'password')}
        displayTwoFactorInput={displayTwoFactorInput}
        twoFactorCode={twoFactorCode}
        loginTwoFactor={this.loginTwoFactor}
        updateTwoFactorCode={this.updateTwoFactorCode}
      />
    );
  }
}

export default LoginPage;
