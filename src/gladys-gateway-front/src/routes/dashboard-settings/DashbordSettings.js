import Layout from '../../components/Layout';
import Accounts from './Accounts';
import Billing from './Billing';
import Geolocation from './Geolocation';
import Sessions from './Sessions';

const DashboardSettings = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.callback}>
    <div class="container">
      
      <div class="row">
        <div class="col-md-3">
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
              
              <a  href="" data-target="billing" onClick={props.changeTab} class={'list-group-item list-group-item-action d-flex align-items-center ' + (props.currentTab === 'billing' && 'active')}>
                <span class="icon mr-3"><i class="fe fe-credit-card" /></span>Billing
              </a>
              
            </div>
          </div>
        </div>

        <div class="col-md-9">
          {props.currentTab === 'sessions' && <Sessions /> }
          {props.currentTab === 'geolocation' && <Geolocation /> }
          {props.currentTab === 'accounts' && <Accounts /> }
          {props.currentTab === 'billing' && <Billing /> }
        </div>
      
      </div>
    </div>
  </Layout>
);

export default DashboardSettings;
