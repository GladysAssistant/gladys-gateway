import { Component } from 'preact';
import DashboardUsers from './DashboardUsers';
import Auth from '../../api/Auth';
import linkState from 'linkstate';
import update from 'immutability-helper';

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
      
      let newState = update(this.state, {
        users: { $push: [invitedUser] }
      });

      this.setState(newState);
    });
  };

  revokeUser = async (user, index) => {
    
    try {
      if (user.is_invitation) {
        await Auth.revokeInvitation(user.id);
      } else {
        await Auth.revokeUser(user.id);
      }
      
      const newState = update(this.state, {
        users: { $splice: [[index, 1]] },
        revokeUserError: { $set: false }
      });

      this.setState(newState);
    } catch (e) {
      this.setState({ revokeUserError: true });
    }
  };

  render({}, { users, email, role, revokeUserError }) {
    return (
      <DashboardUsers
        users={users}
        getUsers={this.getUsers}
        inviteUser={this.inviteUser}
        email={email}
        role={role}
        updateEmail={linkState(this, 'email')}
        updateRole={linkState(this, 'role')}
        revokeUserError={revokeUserError}
        revokeUser={this.revokeUser}
      />
    );
  }
}

export default DashboardUsersPage;
