import { Component } from 'preact';
import Auth from '../../api/Auth';
import Dashboard from './Dashboard';

const DEVICE_TYPE_CACHE_KEY = 'devicetype_rooms';

class DashboardPage extends Component {
  
  state = {
    rooms: [],
    noInstanceFoundError: false
  };

  lastRoomUpdate = null;

  connected = () => {
    Auth.request.get('/devicetype/room', {})
      .then((rooms) => {
        this.lastRoomUpdate = new Date();
        this.setState({ rooms });
        Auth.cache.set(DEVICE_TYPE_CACHE_KEY, { rooms, lastUpdated: new Date() });
      })
      .catch((err) => {
        if (err && err.status === 404 && err.error_message === 'NO_INSTANCE_FOUND') {
          this.setState({ noInstanceFoundError: true });
        }
      });
  }

  updateValue = (deviceType, value) => {
    console.log(deviceType, value);
    Auth.request.post(`/devicetype/${deviceType.id}/exec`, { value })
      .then((response) => {
        console.log(response);
        let newValue = value;
        this.setState({ rooms: [{"id":1,"name":"Test","house":1,"deviceTypes":[{"name":"Lamp","id":2,"type":"binary","category":"light","tag":null,"unit":null,"min":0,"max":1,"display":1,"sensor":0,"identifier":"lamp","device":2,"service":"lamp","lastChanged":"2018-10-10T02:02:29.000Z","lastValue": newValue,"roomHouse":1,"deviceTypeName":"Lamp"},{"name":"Sensor","id":3,"type":"multilevel","category":"humidity-sensor","tag":null,"unit":"%","min":0,"max":100,"display":1,"sensor":1,"identifier":"sensor","device":3,"service":"sensor","lastChanged":null,"lastValue":67,"roomHouse":1,"deviceTypeName":"Humidity"},{"name":"Sensor","id":4,"type":"multilevel","category":"temperature-sensor","tag":null,"unit":"°C","min":-100,"max":200,"display":1,"sensor":1,"identifier":"sensor","device":3,"service":"sensor","lastChanged":null,"lastValue":31,"roomHouse":1,"deviceTypeName":"Temperature"}]}] });
      })
      .catch(console.log);
  };

  componentDidMount = async () => {
    let data = await Auth.cache.get(DEVICE_TYPE_CACHE_KEY);
    if (data && this.lastRoomUpdate === null) {
      this.setState({ rooms: data.rooms });
    }
  };

  render({}, { user, rooms, noInstanceFoundError }) {
    return (
      <Dashboard rooms={rooms} connected={this.connected} updateValue={this.updateValue} noInstanceFoundError={noInstanceFoundError} />
    );
  }
}

export default DashboardPage;
