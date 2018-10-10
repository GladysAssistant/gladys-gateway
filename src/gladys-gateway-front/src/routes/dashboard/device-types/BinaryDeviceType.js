
const BinaryDeviceType = ({ children, ...props }) => (
  <tr>
    <td><i class="fe fe-toggle-right" /></td>
    <td>{props.deviceType.deviceTypeName}</td>
    <td class="text-right">
      <label class="custom-switch" onClick={(e) => props.updateValue(props.deviceType, !props.deviceType.lastValue)}>
        <input type="radio" name="option" value="1" class="custom-switch-input"  checked={props.deviceType.lastValue} />
        <span class="custom-switch-indicator"></span>
      </label>
    </td>
  </tr>
);

export default BinaryDeviceType;