

const InstanceCard = ({ children, ...props }) => (
  <div class="row row-card">
    <div class="col-sm-6 col-lg-3">
      <div class="card p-3">
        <div class="d-flex align-items-center">
          <span class="stamp stamp-md bg-blue mr-3">
            <i class="fe fe-activity" />
          </span>
          <div>
            <h4 class="m-0">Connected</h4>
            <small class="text-muted">12ms ping</small>
          </div>
        </div>
      </div>
    </div>

    <div class="col-sm-6 col-lg-3">
      <div class="card p-3">
        <div class="d-flex align-items-center">
          <span class="stamp stamp-md bg-green mr-3">
            <i class="fe fe-cpu" />
          </span>
          <div>
            <h4 class="m-0">CPU</h4>
            <small class="text-muted">34%</small>
          </div>
        </div>
      </div>
    </div>

    <div class="col-sm-6 col-lg-3">
      <div class="card p-3">
        <div class="d-flex align-items-center">
          <span class="stamp stamp-md bg-red mr-3">
            <i class="fe fe-heart" />
          </span>
          <div>
            <h4 class="m-0">Uptime</h4>
            <small class="text-muted">12 days</small>
          </div>
        </div>
      </div>
    </div>

    <div class="col-sm-6 col-lg-3">
      <div class="card p-3">
        <div class="d-flex align-items-center">
          <span class="stamp stamp-md bg-yellow mr-3">
            <i class="fe fe-git-commit" />
          </span>
          <div>
            <h4 class="m-0">Gladys Version</h4>
            <small class="text-muted">v3.9.1</small>
          </div>
        </div>
      </div>
    </div>

    <div class="col-lg-6">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Statistics</h2>
        </div>
        <table class="table card-table">
          <tbody>
            <tr>
              <td  class="w-1"><i class="fe fe-tag" /></td>
              <td>Device Types</td>
              <td class="text-right">
                <button class="btn btn-secondary disabled btn-sm" style={{cursor: 'default'}}>245 rows</button>
              </td>
            </tr>
            <tr>
              <td  class="w-1"><i class="fe fe-circle" /></td>
              <td>Device States</td>
              <td class="text-right">
                <button class="btn btn-secondary disabled btn-sm" style={{cursor: 'default'}}>400k rows</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="col-lg-6">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Manage</h2>
        </div>
        <table class="table card-table">
          <tbody>
            <tr>
              <td>Update Gladys Data</td>
              <td class="text-right">
                <button class="btn btn-success btn-sm">Update</button>
              </td>
            </tr>
            <tr>
              <td>Restart your Gladys instance</td>
              <td class="text-right">
                <button class="btn btn-danger btn-sm">Restart</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>


  </div>
);

export default InstanceCard;