const mongoose = require('mongoose');

const ROLES = ['APPLICANT', 'KYC_OFFICER', 'COMPLIANCE_OFFICER'];

const userSchema = new mongoose.Schema(
  {
    user_code: { type: String, unique: true, sparse: true }, // e.g. U1, U2 for seeded staff
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    full_name: { type: String, required: true },
    password_hash: { type: String, required: true },
    roles: { type: [String], enum: ROLES, required: true },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return { id: this._id, user_code: this.user_code, username: this.username, full_name: this.full_name, roles: this.roles };
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
