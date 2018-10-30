const OPEN_CLOSE_SENSORS = ['door-opening-sensor', 'window-opening-sensor'];

const SensorDeviceType = ({ children, ...props }) => (
  <tr>
    <td>
      { props.deviceType.category === 'temperature-sensor' && <i class="fe fe-thermometer" /> }
      { props.deviceType.category === 'humidity-sensor' && <i class="fe fe-droplet" /> }
      { props.deviceType.category === 'light-sensor' && <i class="fe fe-sun" /> }
      { props.deviceType.category === 'battery-sensor' && <i class="fe fe-percent" /> }
      { OPEN_CLOSE_SENSORS.indexOf(props.deviceType.category) !== -1 && <i class="fe fe-home" /> }
      { props.deviceType.category === null && <i class="fe fe-bar-chart-2" /> }
    </td>
    { props.deviceType.deviceTypeName && <td>{props.deviceType.deviceTypeName}</td> }
    { !props.deviceType.deviceTypeName && props.deviceType.type === 'binary' && <td>{props.deviceType.name}</td>}
    { !props.deviceType.deviceTypeName && props.deviceType.type !== 'binary' && <td>{props.deviceType.name} - {props.deviceType.type}</td>}
    { OPEN_CLOSE_SENSORS.indexOf(props.deviceType.category) === -1 &&
      <td class="text-right">
        {props.deviceType.lastValue} {props.deviceType.unit}
      </td>
    }
    {  OPEN_CLOSE_SENSORS.indexOf(props.deviceType.category) !== -1 &&
      <td class="text-right">
        {props.deviceType.lastValue === 1 && <i class="fe fe-shield" /> }
        {props.deviceType.lastValue === 0 && <i class="fe fe-shield-off" /> }
      </td>
    }
  </tr>
);

export default SensorDeviceType;