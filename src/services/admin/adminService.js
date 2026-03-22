import User from "../../model/userModel.js";
import bcrypt from "bcrypt";

export const authenticateAdmin = async (email, password) => {
    const user = await User.findOne({ email: email.toLowerCase() });
    

    if (!user || user.role !== "admin") {
        throw new Error("Invalid admin credentials.");
    }
    // Inside your authenticateAdmin function
if (user.role !== 'admin') {
    throw new Error("Access denied. Not an admin account.");
}

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error("Invalid admin credentials.");
    }

    return user;
};