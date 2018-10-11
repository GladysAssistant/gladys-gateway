import RoomCard from './RoomCard';

const DeviceList = ({ children, ...props }) => (
  <div class="row row-cards">
    {props.rooms.map((room, index) => (
      <RoomCard
        room={room}
        roomIndex={index}
        updateValue={props.updateValue}
        collapseRoom={props.collapseRoom}
      />
    ))}
  </div>
);

export default DeviceList;
