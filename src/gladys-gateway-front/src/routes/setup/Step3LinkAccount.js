import style from './style.css';

const Step3LinkGladys = ({ children, ...props }) => (
  <div class={'row ' + style.equal}>
    <div class="col-md">
      <div class="card" style={{ height: '100%' }}>
        <div class="card-body">
          <div class="media">
            <span
              class="avatar avatar-xxl mr-5"
              style="background-image: url(/assets/icons/user-default.png)"
            />
            <div class="media-body">
              <h4 class="m-0">Tony Stark</h4>
              <p class="text-muted mb-0">tony.stark@gladysproject.com</p>
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
          <div class="row">
            <div class="col-md">
              <select class="form-control custom-select">
                <option value="">1. Tony Stark</option>
              </select>
            </div>
            <div class="col-md-4">
              <button type="submit" class="btn btn-primary">
                Link account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default Step3LinkGladys;
