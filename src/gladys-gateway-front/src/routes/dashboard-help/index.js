import Layout from '../../components/Layout';

const DashboardHelp = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.callback}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Help</h1>
      </div>
      
    </div>
  </Layout>
);

export default DashboardHelp;
