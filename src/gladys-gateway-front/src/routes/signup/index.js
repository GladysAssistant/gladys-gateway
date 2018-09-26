import { Component } from 'preact';
import linkState from 'linkstate';
import Auth from '../../api/Auth';
import SignupForm from './SignupForm';
import SignupBase from './SignupBase';
import SignupGeneratingKeys from './SignupGeneratingKeys';

class SignupPage extends Component {
  state = {
    name: '',
    email: '',
    password: '',
    fieldsErrored: [],
    currentStep: 1,
    accountAlreadyExist: false
  };

  validateForm = event => {
    event.preventDefault();

    let currentBrowserLanguage = (navigator.language || navigator.userLanguage)
      .toLowerCase()
      .substr(0, 2);

    let newUser = {
      name: this.state.name,
      email: this.state.email,
      password: this.state.password,
      language: currentBrowserLanguage
    };

    Auth.signup(newUser)
      .then(() => {
        this.setState({ fieldsErrored: [], currentStep: 2, accountAlreadyExist: false });
      })
      .catch(error => {
        if (error.response && error.response.status === 422 && error.response.data.details) {
          let fieldsErrored = [];
          error.response.data.details.forEach(err => {
            fieldsErrored.push(err.context.key);
          });
          this.setState({ fieldsErrored });
        } else if (error.response && error.response.status === 409) {
          this.setState({ accountAlreadyExist: true });
        } else {
          
        }
      });
  };

  render({}, { name, email, password, fieldsErrored, currentStep, accountAlreadyExist }) {
    return (
      <SignupBase>
        {currentStep === 1 && (
          <SignupForm
            name={name}
            email={email}
            password={password}
            accountAlreadyExist={accountAlreadyExist}
            fieldsErrored={fieldsErrored}
            updateName={linkState(this, 'name')}
            updateEmail={linkState(this, 'email')}
            updatePassword={linkState(this, 'password')}
            validateForm={this.validateForm}
          />
        )}
        {currentStep === 2 && <SignupGeneratingKeys />}
      </SignupBase>
    );
  }
}

export default SignupPage;
