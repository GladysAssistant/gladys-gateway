import { Component } from 'preact';
import DashboardUsers from './DashboardUsers';
import Auth from '../../api/Auth';
import linkState from 'linkstate';

class DashboardUsersPage extends Component {
  state = {
    users: [],
    role: 'user'
  };

  getUsers = () => {
    Auth.getUsersInAccount().then(users => {
      this.setState({ users });
    });
  };

  inviteUser = () => {
    Auth.inviteUser(this.state.email, this.state.role).then(invitedUser => {
      this.setState({ users: this.state.users.concat([invitedUser]) });
    });
  };

  render({}, { users, email, role }) {
    return (
      <DashboardUsers
        users={users}
        getUsers={this.getUsers}
        inviteUser={this.inviteUser}
        email={email}
        role={role}
        updateEmail={linkState(this, 'email')}
        updateRole={linkState(this, 'role')}
      />
    );
  }
}

export default DashboardUsersPage;
