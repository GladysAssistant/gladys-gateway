import InstanceCard from './InstanceCard';
import Layout from '../../components/Layout';

const DashboardInstance = ({ children, ...props }) => (
  <Layout user={props.user}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">
          Instance
        </h1>
      </div>
      <InstanceCard />
    </div>
  </Layout>
);

export default DashboardInstance;