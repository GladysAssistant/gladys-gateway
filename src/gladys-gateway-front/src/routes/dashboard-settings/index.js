import { Component } from 'preact';
import DashbordSettings from './DashbordSettings';
import Auth from '../../api/Auth';
import update from 'immutability-helper';

class DashboarSettingsPage extends Component {
  
  state = {
    currentTab: 'sessions'
  };

  changeTab = (e) => {
    e.preventDefault();
    this.setState({ currentTab: e.target.getAttribute('data-target') });
  };

  connected = (e) => {
    Auth.getDevices()
      .then((devices) => this.setState({ devices }));
  };

  revokeDevice = (deviceId, index) => {
    Auth.revokeDevice(deviceId)
      .then(() => {
        
        const newState = update(this.state, {
          devices: { $splice: [[index, 1]] }
        });

        this.setState(newState);
      });
  };

  render({}, { currentTab, devices }) {
    return (
      <DashbordSettings
        connected={this.connected}
        currentTab={currentTab}
        changeTab={this.changeTab}
        revokeDevice={this.revokeDevice}
        devices={devices}
      />
    );
  }
}

export default DashboarSettingsPage;
