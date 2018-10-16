import { h, Component } from 'preact';
import { Router, route } from 'preact-router';

// Code-splitting is automated for routes
import Signup from '../routes/signup';
import Login from '../routes/login';
import ConfigureTwoFactor from '../routes/configure-two-factor';
import Setup from '../routes/setup';
import Dashboard from '../routes/dashboard';
import DashboardUsers from '../routes/dashboard-users';
import DashboardInstance from '../routes/dashboard-instance';
import DashboardProfile from '../routes/dashboard-profile';
import DashboardSettings from '../routes/dashboard-settings';
import DashboardHelp from '../routes/dashboard-help';
import ConfirmEmail from '../routes/confirm-email';
import ForgotPassword from '../routes/forgot-password';
import Auth from '../api/Auth';

export default class App extends Component {
  handleRoute = async e => {
    
    if (e.url === '/') {
      route('/dashboard');
    }
    
    if (e.url.startsWith('/dashboard')) {
      let connected = await Auth.isConnected();
      if (connected) {
        this.currentUrl = e.url;
      } else {
        route('/login');
      }
    } else {
      this.currentUrl = e.url;
    }
  };

  render() {
    return (
      <div id="app" style={{ display: 'block', height: '100%' }}>
        <Router onChange={this.handleRoute}>
          <Signup path="/signup" />
          <ConfirmEmail path="/confirm-email/:token" />
          <Login path="/login" />
          <ConfigureTwoFactor path="/configure-two-factor" />
          <Setup path="/setup" />
          <ForgotPassword path="/forgot-password" />
          <Dashboard path="/dashboard" />
          <DashboardUsers path="/dashboard/users" />
          <DashboardInstance path="/dashboard/instance" />
          <DashboardProfile path="/dashboard/profile" />
          <DashboardSettings path="/dashboard/settings" />
          <DashboardHelp path="/dashboard/help" />
        </Router>
      </div>
    );
  }
}
