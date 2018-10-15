import DeviceRow from './DeviceRow';

const RoomCard = ({ children, ...props }) => {
  function collapseRoom(e) {
    props.collapseRoom(e, props.roomIndex);
  }

  return (
    <div class={'card ' + (props.room.collapsed && ' card-collapsed')} style="display: inline-block;">
      <div class="card-header">
        <h3 class="card-title">{props.room.name}</h3>
        <div class="card-options">
          <a
            href=""
            onClick={collapseRoom}
            class="card-options-collapse"
            data-toggle="card-collapse"
          >
            <i class="fe fe-chevron-up" />
          </a>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table card-table table-vcenter">
          <tbody>
            {props.room.deviceTypes.map((deviceType, index) => (
              <DeviceRow
                deviceType={deviceType}
                roomIndex={props.roomIndex}
                deviceTypeIndex={index}
                updateValue={props.updateValue}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RoomCard;
