import { Component } from 'preact';
import DashboardHelp from './DashboardHelp';

class DashboarHelpPage extends Component {
  
  state = {

  };

  render({}, { user, newUser, errors, userSavedSuccess }) {
    return (
      <DashboardHelp />
    );
  }
}

export default DashboarHelpPage;
