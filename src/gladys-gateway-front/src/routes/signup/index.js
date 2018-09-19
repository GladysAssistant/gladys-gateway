const Signup = () => (
  <div className="page">
    <div className="page-single" style={{ marginTop: '40px' }}>
      <div className="container">
        <div className="row">
          <div className="col col-login mx-auto">
            <div className="text-center mb-6">
              {false && <img src="./demo/brand/tabler.svg" className="h-6" alt="" />}
              <h2 className="h-6">Gladys Gateway</h2>
            </div>
            <form className="card" action="" method="post">
              <div className="card-body p-6">
                <div className="card-title">Create new account</div>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input type="text" className="form-control" placeholder="Enter name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input type="email" className="form-control" placeholder="Enter email" />
                </div>
                <div className="form-group">
                  <label className="form-label">Password (min 8 characters)</label>
                  <input type="password" className="form-control" placeholder="Password" />
                </div>
                <div className="form-footer">
                  <button type="submit" className="btn btn-primary btn-block">Create new account</button>
                </div>
              </div>
            </form>
            <div className="text-center text-muted">
              Already have account?
              <a href="./login.html">Sign in</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default Signup;
