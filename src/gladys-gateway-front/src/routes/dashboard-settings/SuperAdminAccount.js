const dateDisplayOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric',  minute: 'numeric' };

const SuperAdminAccount = ({ children, ...props }) => {

  let resendInvitationEmailEn = (e) => {
    e.preventDefault();
    props.resendInvitationEmail(props.account.id, 'en');
  };

  let resendInvitationEmailFr = (e) => {
    e.preventDefault();
    props.resendInvitationEmail(props.account.id, 'fr');
  };

  let mailSucceeded = (props.accountConfirmationSucceed === props.account.id);
  let mailFailed = (props.accountConfirmationFailed === props.account.id);

  return (
    <tr>
      <td>{props.account.name}</td>
      <td>{new Date(props.account.current_period_end).toLocaleDateString('en-US', dateDisplayOptions)}</td>
      <td>{props.account.user_count} users</td>
      <td>{new Date(props.account.created_at).toLocaleDateString('en-US', dateDisplayOptions)}</td>
      { !mailSucceeded && !mailFailed &&
        <td>
          <span>
            <button class="btn btn-primary" onClick={resendInvitationEmailEn}>EN</button>{' '}
            <button class="btn btn-primary" onClick={resendInvitationEmailFr}>FR</button>
          </span>
        </td>
      }
      {mailSucceeded && <td>Success!</td>}
      {mailFailed && <td>Fail!</td>}
    </tr>
  );
};

export default SuperAdminAccount;