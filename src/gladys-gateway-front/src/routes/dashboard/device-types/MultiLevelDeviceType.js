
const MultiLevelDeviceType = ({ children, ...props }) => {
  
  function updateValue(e) {
    props.updateValue(props.deviceType, props.roomIndex, props.deviceTypeIndex, e.target.value, props.deviceType.lastValue);
  }
  
  return (
    <tr>
      <td><i class="fe fe-toggle-right" /></td>
      { props.deviceType.deviceTypeName && <td>{props.deviceType.deviceTypeName}</td> }
      { !props.deviceType.deviceTypeName && <td>{props.deviceType.name} - {props.deviceType.type}</td>}

      <td class="text-right" style="padding-top: 0px; padding-bottom: 0px">
        <div class="col">
          <input
            style={{ minHeight: '30px' }}
            type="range"
            value={props.deviceType.lastValue}
            onChange={updateValue}
            class="form-control custom-range"
            step={((props.deviceType.max - props.deviceType.min)/100)}
            min={props.deviceType.min} max={props.deviceType.max}
          />
        </div>
      </td>
    </tr>
  );
};

export default MultiLevelDeviceType;