import User from "../model/userModel.js"

export const updateProfile = async (userId, { firstName, lastName, phone }) => {
  // minimal validation
  if (!firstName && !lastName && !phone) {
    return { ok: false, msg: "Nothing to update" };
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { firstName, lastName, phone } },
    { new: true, runValidators: true }
  ).select("firstName lastName phone email");

  return { ok: true, user: updated };
};


