import RoomCard from './RoomCard';

const DeviceList = ({ children, ...props }) => (
  <div class="row row-cards">
    { props.rooms.map(room => (
      <RoomCard room={room} updateValue={props.updateValue} />
    ))
    }
  </div>
);

export default DeviceList;