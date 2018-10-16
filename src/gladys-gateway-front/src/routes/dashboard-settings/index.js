import Layout from '../../components/Layout';

const DashboardSettings = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.callback}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
      </div>
      
    </div>
  </Layout>
);

export default DashboardSettings;
