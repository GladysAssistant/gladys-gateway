const LoginForm = ({ children, ...props }) => (
  <div class="page">
    <div class="page-single" style={{ marginTop: '40px' }}>
      <div class="container">
        <div class="row">
          <div class="col col-login mx-auto">
            <div class="text-center mb-6">
              <h2>Gladys Gateway</h2>
            </div>
            <form onSubmit={props.login} class="card">
              <div class="card-body p-6">
                <div class="card-title">Login to your account</div>
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
                <div class="form-group">
                  <label class="form-label">
                    Password
                    <a href="./forgot-password.html" class="float-right small">
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
                <div class="form-footer">
                  <button type="submit" class="btn btn-primary btn-block">
                    Sign in
                  </button>
                </div>
              </div>
            </form>
            <div class="text-center text-muted">
              Don't have account yet? <a href="./register.html">Sign up</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default LoginForm;
