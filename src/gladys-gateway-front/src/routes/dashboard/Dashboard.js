import Layout from '../../components/Layout';
import EmptyState from './EmptyState';
import DeviceList from './DeviceList';

const Dashboard = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.connected} newInstanceEvent={props.newInstanceEvent}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
      </div>

      {props.noInstanceFoundError && (
        <div class="alert alert-warning" role="alert">
          Warning: We were unable to connect to your Gladys instance.
        </div>
      )}

      {props.accountExpired && (
        <div class="alert alert-warning" role="alert">
          Your account has expired, to use the Gateway again, go to "Settings" =>  "Billing" :)
        </div>
      )}

      {props.userNotAcceptedLocallyError && (
        <div class="alert alert-warning" role="alert">
         Warning: Your Gladys Gateway user is not allowed to control your local Gladys instance. Go to your local Gladys instance and authorize this user.
        </div>
      )}

      { props.rooms && !props.accountExpired &&
        <DeviceList
          rooms={props.rooms}
          updateValue={props.updateValue}
          collapseRoom={props.collapseRoom}
        />
      }

      {props.rooms && props.rooms.length === 0 && <EmptyState />}
    </div>
  </Layout>
);

export default Dashboard;
