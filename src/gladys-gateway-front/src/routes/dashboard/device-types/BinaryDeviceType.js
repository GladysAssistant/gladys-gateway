
const BinaryDeviceType = ({ children, ...props }) => {
  
  function updateValue() {
    props.updateValue(props.deviceType, props.roomIndex, props.deviceTypeIndex, !props.deviceType.lastValue);
  }
  
  return (
    <tr>
      <td><i class="fe fe-toggle-right" /></td>
      <td>{props.deviceType.deviceTypeName}</td>
      <td class="text-right">
        <label class="custom-switch" onClick={updateValue}>
          <input type="radio" name="option" value="1" class="custom-switch-input"  checked={props.deviceType.lastValue} />
          <span class="custom-switch-indicator" />
        </label>
      </td>
    </tr>
  );
};

export default BinaryDeviceType;