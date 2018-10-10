import DeviceRow from './DeviceRow';

const RoomCard = ({ children, ...props }) => (
  <div class="col-lg-4">
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">{props.room.name}</h3>
        <div class="card-options">
          <a href="#" class="card-options-collapse" data-toggle="card-collapse"><i class="fe fe-chevron-up"></i></a>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table card-table table-vcenter">
          
          <tbody>
            {props.room.deviceTypes.map((deviceType) => (
              <DeviceRow deviceType={deviceType} updateValue={props.updateValue} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default RoomCard;