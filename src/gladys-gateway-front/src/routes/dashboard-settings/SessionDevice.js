const dateDisplayOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

const SessionDevice = ({ children, ...props }) => {
  
  let revokeDevice = (e) => {
    e.preventDefault();
    props.revokeDevice(props.device.id, props.index);
  };

  let createdAt = new Date(props.device.created_at).toLocaleDateString('en-US', dateDisplayOptions);
  let lastSeen = new Date(props.device.last_seen).toLocaleDateString('en-US', dateDisplayOptions);

  return (
    <tr>
      <td>
        <div style="max-width: 400px; overflow: hidden">{props.device.name}</div>
        <div class="small text-muted">
          Registered: {createdAt}
        </div>
      </td>
      <td>
        <div class="small text-muted">Last seen</div>
        <div>{lastSeen}</div>
      </td>
      <td >
        <i style={{ cursor: 'pointer' }} onClick={revokeDevice} class="fe fe-trash-2" />
      </td>
    </tr>
  );
};

export default SessionDevice;