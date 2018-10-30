import style from './style.css';

const Step3LinkGladys = ({ children, ...props }) => (
  <div class={'row ' + style.equal}>
    <div class="col-md">
      <div class="card" style={{ height: '100%' }}>
        <div class="card-body">
          <div class="media">
            <span
              class="avatar avatar-xxl mr-5"
              style={'background-image: url(' + props.user.profile_url + ')'}
            />
            <div class="media-body">
              <h4 class="m-0">{props.user.name}</h4>
              <p class="text-muted mb-0">{props.user.email}</p>
              <p class="text mb-0" style={{ marginTop: '10px' }}>
                Your icon comes from Gravatar. If you want to change your profile picture, change it
                on <a href="https://gravatar.com/">Gravatar.com</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md">
      <div class="card" style={{ height: '100%' }}>
        <div class="card-header">
          <h3 class="card-title">Select your local Gladys user</h3>
        </div>
        <div class="card-body">
          {props.instanceFound === false && (
            <div class="alert alert-danger" role="alert">
              You Gladys instance is not connected. Connect it and reload this page.
            </div>
          )}

          {props.userNotAcceptedLocallyError && (
            <div class="alert alert-danger" role="alert">
            Warning: Your Gladys Gateway user is not allowed to control your local Gladys instance. Go to your local Gladys instance and authorize this user, then reload this page.
            </div>
          )}
          {props.instanceFound &&
          <div class="row">
            <div class="col-md">
              <select
                class="form-control custom-select"
                onChange={props.updateGladysUserSelected}
                value={props.gladysUserSelected}
              >
                {props.usersInGladys.map(gladysUser => (
                  <option value={gladysUser.id}>
                    {gladysUser.id}. {gladysUser.firstname}
                  </option>
                ))}
              </select>
            </div>
            <div class="col-md-4">
              <button type="submit" class="btn btn-primary" onClick={props.saveUserInInGladys}>
                Link account
              </button>
            </div>
          </div>
          }
        </div>
      </div>
    </div>
  </div>
);

export default Step3LinkGladys;
