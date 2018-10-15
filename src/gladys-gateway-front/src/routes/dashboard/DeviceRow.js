import BinaryDeviceType from './device-types/BinaryDeviceType';
import SensorDeviceType from './device-types/SensorDeviceType';
import MultilevelDeviceType from './device-types/MultiLevelDeviceType';

const DeviceRow = ({ children, ...props }) => {
  
  if (props.deviceType.display === 0) {
    return (null);
  }
  
  // if device is a sensor, we display the sensor deviceType
  if (props.deviceType.sensor) {
    return <SensorDeviceType deviceType={props.deviceType} />;
  }

  // else, it's not a sensor

  // if it's a binary
  if (props.deviceType.type === 'binary') {
    return (
      <BinaryDeviceType
        deviceType={props.deviceType}
        roomIndex={props.roomIndex}
        deviceTypeIndex={props.deviceTypeIndex}
        updateValue={props.updateValue}
      />
    );
  }

  // if not, we return the multilevel component
  return (
    <MultilevelDeviceType
      deviceType={props.deviceType}
      roomIndex={props.roomIndex}
      deviceTypeIndex={props.deviceTypeIndex}
      updateValue={props.updateValue}
    />
  );
};

export default DeviceRow;
