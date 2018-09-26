import Layout from '../../components/Layout';

const Dashboard = ({ children, ...props }) => (
  <Layout>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">
          Dashboard
        </h1>
      </div>
      <div class="row row-cards">
      </div>
    </div>
  </Layout>
);

export default Dashboard;