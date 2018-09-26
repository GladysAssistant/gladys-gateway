const ConfirmEmail = ({ children, ...props }) => (
  <div class="page">
    <div class="page-single" style={{ marginTop: '40px' }}>
      <div class="container">
        <div class="row">
          <div class="col col-login mx-auto">
            <div class="text-center mb-6">
              <h2>Gladys Gateway</h2>
            </div>
            <div class="card">
              <div class="card-body p-6">
                { props.error &&
                  <div>
                    <div class="alert alert-danger" role="alert">
                      We are unable to verify your email address.
                    </div>
                    <p>Are you sure you clicked/copied the link correctly?</p>
                    <p>If it still not working, please contact us on <a href="">Twitter</a> or on <a href="">Gladys Community</a>.</p>
                  </div>
                }

                { props.emailConfirmed &&
                  <div>
                    <div class="card-title">Email Confirmed</div>
                    
                    <div class="form-footer">
                      <a href={'/login?email=' + props.email} class="btn btn-primary btn-block">
                        Sign in
                      </a>
                    </div>
                  </div>
                }
                { (!props.emailConfirmed) && (!props.error) &&
                  <div>
                    <div class="card-title">Confirmation in progress...</div>
                    
                    
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default ConfirmEmail;