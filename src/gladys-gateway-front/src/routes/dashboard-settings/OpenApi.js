import OpenApiKey from './OpenApiKey';

const OpenApi = ({ children, ...props }) => (
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">Open API</h3>
    </div>
    <div class="card-body">
      <p>To use Gladys Gateway Open API, you need first to connect to your Gladys local instance, and authorize the Open API in "parameters" => "Gateway" => "Open API". </p>
      <p>Then, create an API key and save it somewhere. You won't be able to see your API key again after generating it.</p>
      <p>Then, to contact the API, you have two routes:</p>
      <p>
        <ul>
          <li><pre>POST https://api.gladysgateway.com/v1/api/message/your-api-key <br /><br />
            Body: {JSON.stringify({ text: 'What time is it?' }, null, 2)}
          </pre>
          </li>
          <li><pre>POST https://api.gladysgateway.com/v1/api/event/your-api-key <br /><br />
            Body: {JSON.stringify({ code: 'wake-up' }, null, 2)}
          </pre>
          </li>
        </ul>
      </p>
    </div>
    <div>
      <div class="table-responsive">
        <table class="table table-hover table-outline table-vcenter text-nowrap card-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Last used</th>
              <th class="w-1">Revoke</th>
            </tr>
          </thead>
          <tbody>
            
            { props.apiKeys && props.apiKeys.map((apiKey, index) => (
              <OpenApiKey apiKey={apiKey} revokeOpenApiKey={props.revokeOpenApiKey} index={index} />
            ))
            }

            <tr>
              <td>
                <input type="text" class={'form-control ' + (props.missingNewOpenApiName ? 'is-invalid' : '')} value={props.newApiKeyName} onChange={props.updateNewApiKeyName} placeholder="Name" />
              </td>
              <td><button class="btn btn-primary" onClick={props.createApiKey}>Generate</button></td>
              <td />
            </tr>
          
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default OpenApi;