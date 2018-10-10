import BinaryDeviceType from './device-types/BinaryDeviceType';
import SensorDeviceType from './device-types/SensorDeviceType';

const DeviceRow = ({ children, ...props }) => {
  if (props.deviceType.type === 'binary') return (<BinaryDeviceType deviceType={props.deviceType} updateValue={props.updateValue} />);
  else if (props.deviceType.sensor) return (<SensorDeviceType deviceType={props.deviceType} />);
};

export default DeviceRow;