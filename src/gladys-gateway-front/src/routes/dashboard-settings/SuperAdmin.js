import SuperAdminAccount from './SuperAdminAccount';

const SuperAdmin = ({ children, ...props }) => (

  <div class="card">
    <div>
      <div class="table-responsive">
        <table class="table table-hover table-outline table-vcenter text-nowrap card-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Period End</th>
              <th>Users</th>
              <th>Creation</th>
              <th>Resend</th>
            </tr>
          </thead>
          <tbody>
            
            { props.accounts && props.accounts.map((account, index) => (
              <SuperAdminAccount account={account} resendInvitationEmail={props.resendInvitationEmail} accountConfirmationSucceed={props.accountConfirmationSucceed} accountConfirmationFailed={props.accountConfirmationFailed} />
            ))
            }
           
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default SuperAdmin;