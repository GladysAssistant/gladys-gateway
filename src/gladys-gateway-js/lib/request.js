const axios = require('axios');

async function getAccessToken(state) {
  var route = state.isInstance ? '/instances/access-token' : '/users/access-token';

  state.accessToken = (await axios.get(state.serverUrl + route, {
    headers: {
      authorization: state.refreshToken
    }
  })).data.access_token;
}

function post(url, data, state) {
  return axios.post(url, data, {
    headers: {
      authorization: state.accessToken
    }
  })
    .then((data) => data.data)
    .catch(async (err) => {
      if (err && err.response && err.response.status === 401) {
        await getAccessToken(state);
        return post(url, data, state);
      } else {
        return Promise.reject(err);
      }
    });
};

function remove(url, state) {
  return axios.delete(url, {
    headers: {
      authorization: state.accessToken
    }
  })
    .then((data) => data.data)
    .catch(async (err) => {
      if (err && err.response && err.response.status === 401) {
        await getAccessToken(state);
        return post(url, data, state);
      } else {
        return Promise.reject(err);
      }
    });
};

function patch(url, data, state) {
  return axios.patch(url, data, {
    headers: {
      authorization: state.accessToken
    }
  })
    .then((data) => data.data)
    .catch(async (err) => {
      if (err && err.response && err.response.status === 401) {
        await getAccessToken(state);
        return patch(url, data, state);
      } else {
        return Promise.reject(err);
      }
    });
};

function get(url, state) {
  return axios.get(url, {
    headers: {
      authorization: state.accessToken
    }
  })
    .then((data) => data.data)
    .catch(async (err) => {
      if (err && err.response && err.response.status === 401) {
        await getAccessToken(state);
        return get(url, state);
      } else {
        return Promise.reject(err);
      }
    });
};

module.exports.post = post;
module.exports.get = get;
module.exports.patch = patch;
module.exports.delete = remove;
