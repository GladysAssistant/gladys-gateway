import { Component } from 'preact';
import Header from './Header';
import Footer from './Footer';
import Auth from '../api/Auth';
import { route } from 'preact-router';

class Layout extends Component {
  state = {
    user: {},
    showDropDown: false,
    showCollapsedMenu: false
  };

  toggleDropDown = () => {
    this.setState({ showDropDown: !this.state.showDropDown });
  };

  toggleCollapsedMenu = () => {
    this.setState({ showCollapsedMenu: !this.state.showCollapsedMenu });
  };

  logout = async (e) => {
    e.preventDefault();
    
    try {
      await Auth.revokeCurrentDevice();
    } catch (e) {
      console.log(e);
    }

    Auth.cleanLocalState();
    route('/login');
  };

  componentDidMount = () => {
    Auth.connectSocket(this.props.newInstanceEvent)
      .then(() => Auth.getMySelf())
      .then(user => this.setState({ user }))
      .then(() => Auth.isAccoutSetup())
      .then((isAccountSetup) => {
        if (!isAccountSetup) {
          route('/setup');
        }
      })
      .then(() => {
        if (this.props.callback) {
          this.props.callback();
        }
      })
      .catch(err => {
        if (err && err.response && err.response.data && err.response.data.status === 401) {
          route('/login');
        } else if (err && err.response && err.response.data && err.response.data.status === 403) {
          route('/login');
        } else {
          console.log(err);
        }
      });
  };

  render(props, { showDropDown, showCollapsedMenu, user }) {
    return (
      <div class="page">
        <div class="page-main">
          <Header
            user={user}
            showDropDown={showDropDown}
            toggleDropDown={this.toggleDropDown}
            showCollapsedMenu={showCollapsedMenu}
            toggleCollapsedMenu={this.toggleCollapsedMenu}
            logout={this.logout}
          />
          <div class="my-3 my-md-5">{props.children}</div>
        </div>
        <Footer user={props.user} />
      </div>
    );
  }
}

export default Layout;
