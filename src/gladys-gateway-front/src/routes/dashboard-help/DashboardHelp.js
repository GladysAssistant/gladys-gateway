import Layout from '../../components/Layout';

const DashboardHelp = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.callback}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Help</h1>
      </div>

      <div class="row">
        <div class="col-lg-9">
          <div class="card">
            <div class="card-body">
              
              <div class="text-wrap p-lg-6">
                <h2 class="mt-0 mb-4" id="introduction">Introduction</h2>
                <p>The Gladys Gateway is a way for your to access your local Gladys instance without opening your network.</p>
                <p>The Gladys Gateway is fully end-to-end encrypted.</p>

                <h2 class="mt-0 mb-4" id="help">Need help</h2>
                <p>If you need help, please open a topic on <a href="http://community.gladysproject.com/">Gladys Community</a></p>
                <p>It's the best place to receive help 🙂</p>
                <div class="alert alert-primary mt-5 mb-6">
                  <div><strong>Work in progress!</strong> More detailed documentation is coming soon.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-3 order-lg-1 mb-4">
          <a href="https://github.com/GladysProject/gladys-gateway" class="btn btn-block btn-primary mb-6">
            <i class="fe fe-github mr-2" />Browse source code
          </a>

          <div class="list-group list-group-transparent mb-0">
            <a href="#introduction" class="list-group-item list-group-item-action"><span class="icon mr-3"><i class="fe fe-flag" /></span>Introduction</a>
          </div>
          
          <div class="d-none d-lg-block mt-6">
            <a href="https://github.com/tabler/tabler/edit/dev/src/_docs/alerts.md" class="text-muted">Edit this page</a>
          </div>
        </div>
      </div>
      
    </div>
  </Layout>
);

export default DashboardHelp;
