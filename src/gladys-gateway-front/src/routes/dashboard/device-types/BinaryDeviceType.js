
const BinaryDeviceType = ({ children, ...props }) => {
  
  function updateValue() {
    props.updateValue(props.deviceType, props.roomIndex, props.deviceTypeIndex, !props.deviceType.lastValue, props.deviceType.lastValue);
  }
  
  return (
    <tr>
      <td><i class="fe fe-toggle-right" /></td>
      <td>{props.deviceType.deviceTypeName}</td>
      <td class="text-right">
        <label class="custom-switch">
          <input type="radio" name={props.deviceType.id} value="1" class="custom-switch-input"  checked={props.deviceType.lastValue} onClick={updateValue} />
          <span class="custom-switch-indicator" />
        </label>
      </td>
    </tr>
  );
};

export default BinaryDeviceType;