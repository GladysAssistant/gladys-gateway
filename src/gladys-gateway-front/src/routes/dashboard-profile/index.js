import { Component } from 'preact';
import DashboardProfile from './DashboardProfile';
import Auth from '../../api/Auth';
import update from 'immutability-helper';

class DashboardProfilePage extends Component {
  
  state = {
    user: null,
    newUser: {},
    errors: []
  };

  getUser = () => {
    Auth.getMySelf().then(user => {
      this.setState({ user, newUser: user });
    });
  };

  saveUser = async (e) => {
    e.preventDefault();
    
    let errors = [];
    
    if (this.state.newUser.newPassword && (this.state.newUser.newPassword !== this.state.newUser.newPasswordRepeat)) {
      errors.push('password-not-matching');
    }

    if (this.state.newUser.newPassword && this.state.newUser.newPassword.length < 8) {
      errors.push('password-too-short');
    }

    if ((this.state.newUser.email !== this.state.user.email) && !this.state.newUser.newPassword) {
      errors.push('password-should-be-provided-to-update-email');
    }

    this.setState({ errors, userSavedSuccess: null });

    if (errors.length) {
      return;
    }

    return Auth.updateMyself(this.state.newUser.name, this.state.newUser.email, this.state.newUser.newPassword, this.state.newUser.language)
      .then((newUser) => {
        Auth.saveUser(newUser);
        this.setState({ user: newUser, newUser, userSavedSuccess: true });
      })
      .catch((err) => this.setState({ userSavedSuccess: false }));
  };

  updateValue = (attribute) => (e) => {
    let newState = update(this.state, {
      newUser: { [attribute]: { $set: e.target.value } }
    });
    this.setState(newState);
  };

  connected = () => {
    this.getUser();
  };

  render({}, { user, newUser, errors, userSavedSuccess }) {
    return (
      <DashboardProfile
        connected={this.connected}
        user={user}
        newUser={newUser}
        errors={errors}
        userSavedSuccess={userSavedSuccess}
        updateName={this.updateValue('name')}
        updateEmail={this.updateValue('email')}
        updateLanguage={this.updateValue('language')}
        updateNewPassword={this.updateValue('newPassword')}
        updateNewPasswordRepeat={this.updateValue('newPasswordRepeat')}
        saveUser={this.saveUser}
      />
    );
  }
}

export default DashboardProfilePage;
