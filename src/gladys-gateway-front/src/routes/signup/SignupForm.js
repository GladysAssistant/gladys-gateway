const SignupForm = ({ children, ...props }) => (
  <form onSubmit={props.validateForm} className="card">
    <div className="card-body p-6">
      <div className="card-title">Create new account</div>
      {props.accountAlreadyExist && (
        <div class="alert alert-danger" role="alert">
          An account with that email already exist
        </div>
      )}
      {props.browserCompatible === false && (
        <div class="alert alert-danger" role="alert">
          Sorry, your browser is not compatible with the Gladys Gateway. Your browser should support
          the WebCrypto API.
        </div>
      )}

      {props.tokenError === true && (
        <div class="alert alert-danger" role="alert">
          You have to subscribe to the Gladys Community Package on Gladys website first!
        </div>
      )}

      {props.unknownError === true && (
        <div class="alert alert-danger" role="alert">
          An unknown error occured. Please retry later or contact me at hello@gladysassistant.com to
          understand what happened.
        </div>
      )}

      {props.invitationError && (
        <div class="alert alert-danger" role="alert">
          We cannot retrieve your invitation. Maybe it was already used or has expired!
        </div>
      )}

      {!props.invitationError && props.browserCompatible && (
        <div>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              className={
                'form-control ' + (props.fieldsErrored.includes('name') ? 'is-invalid' : '')
              }
              placeholder="Enter name"
              value={props.name}
              onInput={props.updateName}
            />
            <div class="invalid-feedback">Name should be between 2 and 30 characters</div>
          </div>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              type="email"
              className={
                'form-control ' + (props.fieldsErrored.includes('email') ? 'is-invalid' : '')
              }
              placeholder="Enter email"
              value={props.email}
              disabled={props.token && 'disabled'}
              onInput={props.updateEmail}
            />
            <div class="invalid-feedback">Email is not valid</div>
          </div>
          <div className="form-group">
            <label className="form-label">Password (min 8 characters)</label>
            <input
              type="password"
              className={
                'form-control ' + (props.fieldsErrored.includes('password') ? 'is-invalid' : '')
              }
              placeholder="Password"
              value={props.password}
              onInput={props.updatePassword}
            />
            <div class="invalid-feedback">Password should be 8 characters</div>
          </div>
          <div className="form-footer">
            <button type="submit" className="btn btn-primary btn-block">
              Create new account
            </button>
          </div>
        </div>
      )}
    </div>
  </form>
);

export default SignupForm;
