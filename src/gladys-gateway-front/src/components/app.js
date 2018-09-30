import { h, Component } from 'preact';
import { Router } from 'preact-router';

// Code-splitting is automated for routes
import Signup from '../routes/signup';
import Login from '../routes/login';
import ConfigureTwoFactor from '../routes/configure-two-factor';
import Setup from '../routes/setup';
import Dashboard from '../routes/dashboard';
import ConfirmEmail from '../routes/confirm-email';
import ForgotPassword from '../routes/forgot-password';

export default class App extends Component {
  
  /** Gets fired when the route changes.
   *	@param {Object} event		"change" event from [preact-router](http://git.io/preact-router)
   *	@param {string} event.url	The newly routed URL
   */
  handleRoute = e => {
    this.currentUrl = e.url;
  };

  render() {
    return (
      <div id="app">
        <Router onChange={this.handleRoute}>
          <Signup path="/signup" />
          <ConfirmEmail path="/confirm-email/:token" />
          <Login path="/login" />
          <ConfigureTwoFactor path="/configure-two-factor" />
          <Setup path="/setup" />
          <ForgotPassword path="/forgot-password" />
          <Dashboard path="/dashboard" />
        </Router>
      </div>
    );
  }
}
