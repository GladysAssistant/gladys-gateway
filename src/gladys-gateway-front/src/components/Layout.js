import { Component } from 'preact';
import Header from './Header';
import Footer from './Footer';

class Layout extends Component {
  
  state = {
    showDropDown: false,
    showCollapsedMenu: false
  };

  toggleDropDown = () => {
    this.setState({ showDropDown: !this.state.showDropDown });
  };

  toggleCollapsedMenu = () => {
    this.setState({ showCollapsedMenu: !this.state.showCollapsedMenu });
  };

  componentDidMount = () => {
   
  };

  render(props, { showDropDown, showCollapsedMenu }) {
    return (
      <div class="page">
        <div class="page-main" >
          <Header user={props.user}
            showDropDown={showDropDown}
            toggleDropDown={this.toggleDropDown}
            showCollapsedMenu={showCollapsedMenu}
            toggleCollapsedMenu={this.toggleCollapsedMenu}
          />
          <div class="my-3 my-md-5">{props.children}</div>
        </div>
        <Footer user={props.user} />
      </div>
    );
  }
}

export default Layout;