import Layout from '../../components/Layout';
import Accounts from './Accounts';
import Billing from './Billing';
import Geolocation from './Geolocation';
import Sessions from './Sessions';
import Invoices from './Invoices';
import SuperAdmin from './SuperAdmin';

const DashboardSettings = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.connected} dontCheckSetup >
    <div class="container">
      
      <div class="row">
        <div class="col-lg-3">
          <h3 class="page-title mb-5">Settings</h3>
          <div>
            <div class="list-group list-group-transparent mb-0">
              
              <a href="" data-target="sessions" onClick={props.changeTab} class={'list-group-item list-group-item-action d-flex align-items-center ' + (props.currentTab === 'sessions' && 'active')}>
                <span class="icon mr-3"><i class="fe fe-smartphone" /></span>Sessions
              </a>
              
              <a href="" data-target="geolocation" onClick={props.changeTab} class={'list-group-item list-group-item-action d-flex align-items-center ' + (props.currentTab === 'geolocation' && 'active')}>
                <span class="icon mr-3"><i class="fe fe-map-pin" /></span>Geolocation
              </a>

              <a href="" data-target="accounts" onClick={props.changeTab} class={'list-group-item list-group-item-action d-flex align-items-center ' + (props.currentTab === 'accounts' && 'active')}>
                <span class="icon mr-3"><i class="fe fe-refresh-cw" /></span>Connected accounts
              </a>

              <a  href="" data-target="invoices" onClick={props.changeTab} class={'list-group-item list-group-item-action d-flex align-items-center ' + (props.currentTab === 'invoices' && 'active')}>
                <span class="icon mr-3"><i class="fe fe-file" /></span>Invoices
              </a>
              
              <a  href="" data-target="billing" onClick={props.changeTab} class={'list-group-item list-group-item-action d-flex align-items-center ' + (props.currentTab === 'billing' && 'active')}>
                <span class="icon mr-3"><i class="fe fe-credit-card" /></span>Billing
              </a>

              {props.isSuperAdmin === true &&
                 <a  href="" data-target="super-admin" onClick={props.changeTab} class={'list-group-item list-group-item-action d-flex align-items-center ' + (props.currentTab === 'super-admin' && 'active')}>
                   <span class="icon mr-3"><i class="fe fe-book" /></span>Administrate
                 </a>
              }
              
            </div>
          </div>
        </div>

        <div class="col-lg-9">
          {props.currentTab === 'sessions' && <Sessions devices={props.devices} revokeDevice={props.revokeDevice} /> }
          {props.currentTab === 'geolocation' && <Geolocation /> }
          {props.currentTab === 'accounts' && <Accounts /> }
          {props.currentTab === 'billing' &&
            <Billing
              stripeLoaded={props.stripeLoaded}
              saveBillingInformations={props.saveBillingInformations}
              userCardName={props.userCardName}
              updateUserCardName={props.updateUserCardName}
              card={props.card} cancelMonthlySubscription={props.cancelMonthlySubscription}
              cancelMonthlySubscriptionError={props.cancelMonthlySubscriptionError}
              cancelMonthlySubscriptionSuccess={props.cancelMonthlySubscriptionSuccess}
              reSubcribeMonthlyPlan={props.reSubcribeMonthlyPlan}
              reSubscribeMonthlyPlanError={props.reSubscribeMonthlyPlanError}
            />
          }
          {props.currentTab === 'invoices' && <Invoices invoices={props.invoices} />}
          {props.currentTab === 'super-admin' && <SuperAdmin accounts={props.accounts} resendInvitationEmail={props.resendInvitationEmail} accountConfirmationSucceed={props.accountConfirmationSucceed} accountConfirmationFailed={props.accountConfirmationFailed} />}
        </div>
      
      </div>
    </div>
  </Layout>
);

export default DashboardSettings;
