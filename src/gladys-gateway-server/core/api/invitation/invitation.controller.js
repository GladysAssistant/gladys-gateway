module.exports = function InvitationController(invitationModel) {
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
    const invitation = await invitationModel.inviteUser(req.user, req.body);
    res.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      account_id: invitation.account_id,
      is_invitation: true,
      created_at: invitation.created_at,
    });
  }

  /**
   * @api {post} /invitations/accept Accept invitation
   * @apiName Accept invitation
   * @apiGroup Invitation
   *
   * @apiParam {String} name Between 2 and 30 characters
   * @apiParam {string="en","fr"} language language of the user
   * @apiParam {string} srp_salt secure remote password salt
   * @apiParam {string} srp_verifier secure remote password verifier
   * @apiParam {string} rsa_public_key user RSA publick key
   * @apiParam {string} rsa_encrypted_private_key user RSA encrypted private key
   * @apiParam {string} ecdsa_public_key user ECDSA publick key
   * @apiParam {string} ecdsa_encrypted_private_key user ECDSA encrypted private key
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 201 CREATED
   *
   * {
   *   "status": 201,
   *   "message": "User created with success."
   * }
   */
  async function accept(req, res, next) {
    await invitationModel.accept(req.body);

    res.status(201).json({
      status: 201,
      message: 'User created with success.',
    });
  }

  /**
   * @api {get} /invitations/:id Get invitation
   * @apiName Get invitation
   * @apiGroup Invitation
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 201 CREATED
   *
   * {
   *   "id": "61243769-6b09-496d-85f6-2189bd54662e",
   *   "email": "tony.stark@gladysassistant.com"
   * }
   */
  async function getInvitation(req, res, next) {
    const invitation = await invitationModel.getInvitation(req.params.id);

    res.json(invitation);
  }

  /**
   * @api {post} /invitations/:id/revoke Revoke invitation
   * @apiName Revoke invitation
   * @apiGroup Invitation
   *
   *
   * @apiSuccessExample {json} Success-Response:
   * HTTP/1.1 201 CREATED
   *
   * {
   *   "success": true
   * }
   */
  async function revokeInvitation(req, res, next) {
    await invitationModel.revokeInvitation(req.user, req.params.id);
    res.json({ success: true });
  }

  return {
    inviteUser,
    accept,
    getInvitation,
    revokeInvitation,
  };
};
