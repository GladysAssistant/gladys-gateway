
const SensorDeviceType = ({ children, ...props }) => (
  <tr>
    <td>
      { props.deviceType.category === 'temperature-sensor' && <i class="fe fe-thermometer" /> }
      { props.deviceType.category === 'humidity-sensor' && <i class="fe fe-percent" /> }
      { props.deviceType.category === null && <i class="fe fe-bar-chart-2" /> }
    </td>
    <td>{props.deviceType.deviceTypeName}</td>
    <td class="text-right">
      {props.deviceType.lastValue} {props.deviceType.unit}
    </td>
  </tr>
);

export default SensorDeviceType;