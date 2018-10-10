import { Component } from 'preact';
import Auth from '../../api/Auth';
import Dashboard from './Dashboard';
import update from 'immutability-helper';

const DEVICE_TYPE_CACHE_KEY = 'devicetype_rooms';

class DashboardPage extends Component {
  
  state = {
    rooms: [],
    noInstanceFoundError: false
  };

  lastRoomUpdate = null;

  saveState = (rooms) => {
    Auth.cache.set(DEVICE_TYPE_CACHE_KEY, { rooms, lastUpdated: new Date() });
  };

  connected = () => {
    Auth.request.get('/devicetype/room', {})
      .then((rooms) => {
        this.lastRoomUpdate = new Date();
        this.setState({ rooms });
        this.saveState(rooms);
      })
      .catch((err) => {
        if (err && err.status === 404 && err.error_message === 'NO_INSTANCE_FOUND') {
          this.setState({ noInstanceFoundError: true });
        }
      });
  };

  updateValue = (deviceType, roomIndex, deviceTypeIndex, value) => {
    Auth.request.post(`/devicetype/${deviceType.id}/exec`, { value })
      .then((response) => {
        
        // create a new immutable state
        const newState = update(this.state, {
          rooms: {
            [roomIndex]: {
              deviceTypes: {
                [deviceTypeIndex]: {
                  lastValue: {
                    $set: response.value
                  }
                }
              }
            }
          }
        });

        this.setState(newState);
        return this.saveState(newState.rooms);
      })
      .catch(console.log);
  };

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
        collapseRoom={this.collapseRoom}
      />
    );
  }
}

export default DashboardPage;
