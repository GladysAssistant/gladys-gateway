import SessionDevice from './SessionDevice';

const Sessions = ({ children, ...props }) => (
  <div class="card">
    <div>
      <div class="table-responsive">
        <table class="table table-hover table-outline table-vcenter text-nowrap card-table">
          <thead>
            <tr>
              <th>Device Name</th>
              <th>Last seen</th>
              <th class="w-1">Revoke</th>
            </tr>
          </thead>
          <tbody>
            
            { props.devices && props.devices.map((device, index) => (
              <SessionDevice device={device} revokeDevice={props.revokeDevice} index={index} />
            ))
            }
           
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default Sessions;