const keyValStore = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, val) {
    return localStorage.setItem(key, val);
  },
  clear() {
    return localStorage.clear();
  }
};

export default keyValStore;
