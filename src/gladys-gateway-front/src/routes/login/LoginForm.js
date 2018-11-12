const LoginForm = ({ children, ...props }) => (
  <div class="page">
    <div class="page-single">
      <div class="container">
        <div class="row">
          <div class="col col-login mx-auto">
            <div class="text-center mb-6">
              <h2>Gladys Gateway</h2>
            </div>

            <form onSubmit={props.login} class="card">
              <div class="card-body p-6">
                <div class="card-title">Login to your account</div>

                { props.browserCompatible === false &&
                  <div class="alert alert-danger" role="alert">
                    Sorry, your browser is not compatible with the Gladys Gateway. Your browser should support the WebCrypto API as well as IndexedDB database.
                  </div>
                }

                {props.loginErrored &&
                  <div class="alert alert-danger" role="alert">
                  Invalid Email/Password.
                  </div>
                }

                {props.loginTwoFactorErrored &&
                  <div class="alert alert-danger" role="alert">
                  Invalid two factor code. If you are using Firefox, we are sorry to say that they are not fully compatible with the WebCrypto API we are using in the Gateway. Try using Chrome or Safari instead.
                  </div>
                }

                {!props.displayTwoFactorInput && (
                  <div class="form-group">
                    <label class="form-label">Email address</label>
                    <input
                      type="email"
                      class="form-control"
                      id="exampleInputEmail1"
                      aria-describedby="emailHelp"
                      placeholder="Enter email"
                      value={props.email}
                      onInput={props.updateEmail}
                    />
                  </div>
                )}

                {!props.displayTwoFactorInput && (
                  <div class="form-group">
                    <label class="form-label">
                      Password
                      <a href="/forgot-password" class="float-right small">
                        I forgot password
                      </a>
                    </label>
                    <input
                      type="password"
                      class="form-control"
                      id="exampleInputPassword1"
                      placeholder="Password"
                      value={props.password}
                      onInput={props.updatePassword}
                    />
                  </div>
                )}

                {props.displayTwoFactorInput && (
                  <div class="form-group">
                    <label class="form-label">Two Factor Code</label>
                    <input
                      type="text"
                      class="form-control"
                      id="exampleInputPassword1"
                      placeholder="6 digits code"
                      value={props.twoFactorCode}
                      onInput={props.updateTwoFactorCode}
                    />
                  </div>
                )}

                <div class="form-footer">
                  {!props.displayTwoFactorInput && (
                    <button type="submit" class="btn btn-primary btn-block" disabled={props.loginInProgress}>
                      Sign in
                    </button>
                  )}

                  {props.displayTwoFactorInput && (
                    <button onClick={props.loginTwoFactor} class="btn btn-primary btn-block" disabled={props.loginTwoFactorInProgress}>
                      Sign in
                    </button>
                  )}
                </div>
              </div>
            </form>
            <div class="text-center text-muted">
              Don't have account yet? <a href="https://gladysproject.com/gladys-community-package">Sign up</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default LoginForm;
