module.exports = function(pingModel) {

  async function ping(req, res, next) {
    await pingModel.ping();
    return res.json({status: 200});
  }

  return {
    ping
  };
};