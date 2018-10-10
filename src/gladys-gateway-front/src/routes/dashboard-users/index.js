import { Component } from 'preact';
import DashboardUsers from './DashboardUsers';
import Auth from '../../api/Auth';
import linkState from 'linkstate';

class DashboardUsersPage extends Component {
  
  state = {
    users: []
  };

  getUsers = () => {
    Auth.getUsersInAccount()
      .then((users) => {
        this.setState({ users });
      });
  };

  inviteUser = () => {
    Auth.inviteUser(this.state.email)
      .then((invitedUser) => {
        this.setState({ users: this.state.users.concat([invitedUser]) });
      });
  };

  render({}, { users, email }) {
    return (
      <DashboardUsers
        users={users}
        getUsers={this.getUsers}
        inviteUser={this.inviteUser}
        email={email}
        updateEmail={linkState(this, 'email')}
      />
    );
  }
}

export default DashboardUsersPage;
