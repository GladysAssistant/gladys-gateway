import { Component } from 'preact';
import DashbordSettings from './DashbordSettings';

class DashboarSettingsPage extends Component {
  
  state = {
    currentTab: 'sessions'
  };

  changeTab = (e) => {
    e.preventDefault();
    this.setState({ currentTab: e.target.getAttribute('data-target') });
  };

  render({}, { currentTab }) {
    return (
      <DashbordSettings
        currentTab={currentTab}
        changeTab={this.changeTab}
      />
    );
  }
}

export default DashboarSettingsPage;
