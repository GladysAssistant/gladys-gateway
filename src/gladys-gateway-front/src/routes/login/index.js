import { Component } from 'preact';
import linkState from 'linkstate';
import Auth from '../../api/Auth';
import LoginForm from './LoginForm';

class LoginPage extends Component {
  state = {
    email: '',
    password: ''
  };

  login = event => {
    event.preventDefault();

    Auth.login(this.state)
      .then(data => {
        Auth.saveAccessToken(data.access_token);
      })
      .catch(err => {
        
      });
  };

  render({}, { email, password }) {
    return (
      <LoginForm
        email={email}
        password={password}
        login={this.login}
        updateEmail={linkState(this, 'email')}
        updatePassword={linkState(this, 'password')}
      />
    );
  }
}

export default LoginPage;
