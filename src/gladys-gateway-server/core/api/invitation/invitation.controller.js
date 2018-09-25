module.exports = function(invitationModel) {

  /**
   * @api {post} /invitations Send invitation
   * @apiName Send invitation
   * @apiGroup Invitation
   *
   * 
   * @apiParam {String} email Email of the user invited
   * 
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 200 OK
   * 
   * {
   *   "email": "pepper.potts@starkindustries.com",
   *   "account_id": "2088d7fa-8dd4-4f2c-ad98-f657487b6447"
   * }
   */
  async function inviteUser(req, res, next) {
    var invitation = await invitationModel.inviteUser(req.user, req.body);
    res.json({
      email: invitation.email,
      account_id: invitation.account_id
    });
  }

  return {
    inviteUser
  };
};