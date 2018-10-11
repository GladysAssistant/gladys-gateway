import Layout from '../../components/Layout';
import UserList from './UserList';

const DashboardUsers = ({ children, ...props }) => (
  <Layout user={props.user} callback={props.getUsers}>
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Users</h1>
      </div>
      <UserList
        users={props.users}
        inviteUser={props.inviteUser}
        email={props.email}
        updateEmail={props.updateEmail}
      />
    </div>
  </Layout>
);

export default DashboardUsers;
