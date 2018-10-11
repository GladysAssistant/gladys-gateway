import InstanceCard from './InstanceCard';
import Layout from '../../components/Layout';

const DashboardInstance = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.connected}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Instance</h1>
      </div>
      <InstanceCard instanceInfos={props.instanceInfos} latency={props.latency} restartGladys={props.restartGladys} trainBrain={props.trainBrain} />
    </div>
  </Layout>
);

export default DashboardInstance;
