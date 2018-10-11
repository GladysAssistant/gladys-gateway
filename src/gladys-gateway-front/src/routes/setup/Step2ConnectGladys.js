import style from './style.css';

const Step2ConnectGladys = ({ children, ...props }) => (
  <div class={'row ' + style.equal}>
    <div class="col-md-6">
      <div class="card p-3">
        <div class="d-flex align-items-center">
          <span class="stamp stamp-md bg-blue mr-3">
            <i class="fe fe-activity" />
          </span>
          <div>
            <h4 class="m-0">
              Connected <small>to Gladys Gateway</small>
            </h4>
            <small class="text-muted">{props.latency}ms ping</small>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <h4>How to connect your Gladys Instance</h4>
          <div class="text">
            <li>Connect to your Gladys instance</li>
            <li>Go to "Parameters"</li>
            <li>Click on the "Gateway" tab</li>
            <li>Connect with your Gladys Gateway account</li>
            <li>Done! Your Gladys instance should appear here.</li>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card" style={{ height: '100%' }}>
        <div class="card-header">
          <h3 class="card-title">
            { !props.instanceFound && 'Waiting for your Gladys Instance...'}
            { props.instanceFound && 'Your instance was found!'}
          </h3>
        </div>
        <div class="card-body" style={{ height: '100%' }}>
          {!props.instanceFound &&
            <div class="dimmer active" style={{ height: '100%' }}>
              <div class="loader" />
              <div class="dimmer-content" />
            </div>
          }
          {props.instanceFound &&
            <div>
              <p>Please verify that the public key fingerprints of your Gladys instance displayed below are the same as displayed on your Gladys instance. The goal is to avoid MITM (Man In The Middle) attack.</p>
              <p><b>RSA-OAEP fingerprint</b>: {props.instance.rsa_fingerprint}</p>
              <p><b>ECDSA fingerprint</b>: {props.instance.ecdsa_fingerprint}</p>
              <button onClick={props.activateStep3} type="submit" class="btn btn-primary btn-block">
                  Next
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  </div>
);

export default Step2ConnectGladys;
