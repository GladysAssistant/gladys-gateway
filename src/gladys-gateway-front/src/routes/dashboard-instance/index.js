import { Component } from 'preact';
import DashboardInstance from './DashboardInstance';

class DashboardInstancePage extends Component {
  state = {};

  render({}, { users }) {
    return <DashboardInstance />;
  }
}

export default DashboardInstancePage;
