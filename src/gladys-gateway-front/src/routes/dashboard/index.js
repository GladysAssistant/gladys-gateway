import { Component } from 'preact';
import Auth from '../../api/Auth';
import Dashboard from './Dashboard';
import update from 'immutability-helper';

const DEVICE_TYPE_CACHE_KEY = 'devicetype_rooms';

class DashboardPage extends Component {
  state = {
    rooms: null,
    noInstanceFoundError: false
  };

  lastRoomUpdate = null;
  deviceTypeDictionnary = {};

  saveState = rooms => {
    Auth.cache.set(DEVICE_TYPE_CACHE_KEY, { rooms, lastUpdated: new Date() });
  };

  connected = (event) => {
    Auth.request
      .get('/devicetype/room', { displayed_only: true })
      .then(rooms => {
        this.lastRoomUpdate = new Date();
        this.setState({ rooms });
        this.saveState(rooms);
        this.indexDeviceTypes(rooms);
      })
      .catch(err => {
        if (err && err.status === 404 && err.error_message === 'NO_INSTANCE_FOUND') {
          this.setState({ noInstanceFoundError: true });
        }
      });
  };

  updateValue = (deviceType, roomIndex, deviceTypeIndex, value) => {
    Auth.request
      .post(`/devicetype/${deviceType.id}/exec`, { value })
      .then(response => {
        this.updateLocalValue( roomIndex, deviceTypeIndex, response.value);
      })
      .catch(console.log);
  };

  updateLocalValue = (roomIndex, deviceTypeIndex, value) => {
    
    // create a new immutable state
    const newState = update(this.state, {
      rooms: {
        [roomIndex]: {
          deviceTypes: {
            [deviceTypeIndex]: {
              lastValue: {
                $set: value
              }
            }
          }
        }
      }
    });

    this.setState(newState);

    // save state in storage
    return this.saveState(newState.rooms);
  };

  indexDeviceTypes = (rooms) => {

    rooms.forEach((room, roomIndex) => {
      room.deviceTypes.forEach((deviceType, deviceTypeIndex) => {
        this.deviceTypeDictionnary[deviceType.id] = {
          deviceTypeIndex,
          roomIndex
        };
      });
    });
  }

  newInstanceEvent = (type, message) => {
    if (type === 'message') {
      if (message.type === 'gladys-event' && message.event === 'devicestate-new') {
        let deviceTypeId = message.data.devicetype;
        let value = message.data.value;
      
        if (this.deviceTypeDictionnary[deviceTypeId]) {
          this.updateLocalValue(this.deviceTypeDictionnary[deviceTypeId].roomIndex, this.deviceTypeDictionnary[deviceTypeId].deviceTypeIndex, value);
        }
      }
    }
  }

  collapseRoom = (e, index) => {
    e.preventDefault();

    // create a new immutable state
    const newState = update(this.state, {
      rooms: { [index]: { collapsed: { $set: !this.state.rooms[index].collapsed } } }
    });

    this.setState(newState);
  };

  componentDidMount = async () => {
    let data = await Auth.cache.get(DEVICE_TYPE_CACHE_KEY);
    if (data && this.lastRoomUpdate === null) {
      this.setState({ rooms: data.rooms });
    }
  };

  render({}, { user, rooms, noInstanceFoundError }) {
    return (
      <Dashboard
        rooms={rooms}
        connected={this.connected}
        updateValue={this.updateValue}
        noInstanceFoundError={noInstanceFoundError}
        newInstanceEvent={this.newInstanceEvent}
        collapseRoom={this.collapseRoom}
      />
    );
  }
}

export default DashboardPage;
