const SignupBase = ({ children, ...props }) => (
  <div className="page">
    <div className="page-single" style={{ marginTop: '40px' }}>
      <div className="container">
        <div className="row">
          <div className="col col-login mx-auto">
            <div className="text-center mb-6">
              <h2 className="h-6">Gladys Gateway</h2>
            </div>
            {children}
            { props.currentStep === 1 &&
              <div className="text-center text-muted">
                Already have account?
                <a href="./login.html">Sign in</a>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default SignupBase;
