const UserList = ({ children, ...props }) => (
  <div class="col-lg-12">
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Manage your users</h3>
      </div>
      <div class="table-responsive">
        <table class="table card-table table-striped table-vcenter">
          <thead>
            <tr>
              <th />
              <th>Name</th>
              <th>Role</th>
              <th>Added at</th>
              <th>Revoke</th>
            </tr>
          </thead>
          <tbody>
            {props.users.map(user => (
              <tr>
                <td class="w-1">
                  <span
                    class="avatar"
                    style="background-image: url(/assets/images/undraw_profile_pic.svg)"
                  />
                </td>
                <td>
                  {user.name}
                  <div class="small text-muted">{user.email}</div>
                </td>
                <td>{user.role}</td>
                <td class="text-nowrap">{user.created_at}</td>
                <td class="w-1" />
              </tr>
            ))}

            <tr>
              <td />
              <td>
                <input onChange={props.updateEmail} value={props.email} type="email" class="form-control" placeholder="Email" />
              </td>
              <td>
                <select class="form-control custom-select selectized" onChange={props.updateRole} value={props.role}>
                  <option value="admin">Administrator</option>
                  <option value="user">User</option>
                </select>
              </td>
              <td>
                <button onClick={props.inviteUser} class="btn btn-primary ml-auto">Invite User</button>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default UserList;
