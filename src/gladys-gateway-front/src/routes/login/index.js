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
    loginErrored: false,
    loginTwoFactorErrored: false,
    browserCompatible: Auth.testBrowserCompatibility(),
    isFireFox: navigator.userAgent.toLowerCase().indexOf('firefox') > -1,
    loginInProgress: false,
    loginTwoFactorInProgress: false
  };

  login = event => {
    event.preventDefault();
    this.setState({ loginInProgress: true });
    Auth.login(this.state)
      .then(async data => {
        if (data.two_factor_token) {
          this.setState({ loginErrored: false, displayTwoFactorInput: true, twoFactorToken: data.two_factor_token, loginInProgress: false });
        } else {
          await Auth.saveTwoFactorAccessToken(data.access_token);
          route('/configure-two-factor');
        }
      })
      .catch(err => {
        console.log(err);
        this.setState({ loginErrored: true, loginInProgress: false });
      });
  };

  loginTwoFactor = event => {
    event.preventDefault();
    
    this.setState({ loginTwoFactorInProgress: true });

    let twoFactorCode = this.state.twoFactorCode.replace(/\s/g, '');

    // we login
    Auth.loginTwoFactor(this.state.twoFactorToken, this.state.password, twoFactorCode, window.navigator.userAgent)

      // we save the users info
      .then(data => Auth.saveLoginInformations(data))

      // we test if the user needs to be sent to setup
      .then(() => Auth.isAccoutSetup())

      .then(isAccounSetup => {
        if (isAccounSetup) {
          route('/dashboard');
        } else {
          route('/setup');
        }
      })

      //return Auth.request.get('/devicetype/room', {data: 'test'});
      .catch(err => {
        console.log(err);
        this.setState({ loginTwoFactorErrored: true, loginTwoFactorInProgress: false });
      });
  };

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

  componentDidMount = () => {
    Auth.cleanLocalState();
  };

  render({}, { email, password, displayTwoFactorInput, twoFactorCode, browserCompatible, loginErrored, loginTwoFactorErrored, loginInProgress, loginTwoFactorInProgress, isFireFox }) {
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
        browserCompatible={browserCompatible}
        loginErrored={loginErrored}
        loginTwoFactorErrored={loginTwoFactorErrored}
        loginInProgress={loginInProgress}
        loginTwoFactorInProgress={loginTwoFactorInProgress}
        isFireFox={isFireFox}
      />
    );
  }
}

export default LoginPage;
