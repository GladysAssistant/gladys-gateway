import Layout from '../../components/Layout';
import EmptyState from './EmptyState';
import DeviceList from './DeviceList';

const Dashboard = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.connected}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
      </div>

      {props.noInstanceFoundError && (
        <div class="alert alert-warning" role="alert">
          Warning: We were unable to connect to your Gladys instance.
        </div>
      )}

      <DeviceList
        rooms={props.rooms}
        updateValue={props.updateValue}
        collapseRoom={props.collapseRoom}
      />

      {false && <EmptyState />}
    </div>
  </Layout>
);

export default Dashboard;
