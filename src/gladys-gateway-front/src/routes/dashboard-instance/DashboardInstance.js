import InstanceCard from './InstanceCard';
import Layout from '../../components/Layout';

const DashboardInstance = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.connected}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Instance</h1>
      </div>
      {props.noInstanceFoundError && (
        <div class="alert alert-warning" role="alert">
          Warning: We were unable to connect to your Gladys instance.
        </div>
      )}
      <InstanceCard instanceInfos={props.instanceInfos} latency={props.latency} restartGladys={props.restartGladys} trainBrain={props.trainBrain} noInstanceFoundError={props.noInstanceFoundError} />
    </div>
  </Layout>
);

export default DashboardInstance;
