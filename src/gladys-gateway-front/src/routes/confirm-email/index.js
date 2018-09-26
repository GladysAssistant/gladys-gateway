import { Component } from 'preact';
import Auth from '../../api/Auth';
import ConfirmEmail from './ConfirmEmail';

class ConfirmEmailPage extends Component {
  
  state = {
    emailConfirmed: false,
    error: false
  };

  componentDidMount() {
    Auth.confirmEmail(this.props.token)
      .then(result => {
        this.setState({
          email: result.email,
          emailConfirmed: true
        });
      })
      .catch(err => {
        this.setState({
          error: true
        });
      });
  }

 
  render({}, { emailConfirmed, email, error }) {
    
    return (
      <ConfirmEmail emailConfirmed={emailConfirmed} email={email} error={error} />
    );
  }
}

export default ConfirmEmailPage;
