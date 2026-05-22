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

export const getCustomers = async (search, status, page, limit) => {
    const skip = (page - 1) * limit;
    let query = { role: "user" };

    if (search) {
        query.$or = [
            { fullName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }
        ];
    }

    if (status && status !== "All") {
        query.status = status.toLowerCase();
    }

    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    const customers = await User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    return { customers, totalPages };
};

export const toggleCustomerStatus = async (id) => {
    const user = await User.findById(id);
    if (!user) throw new Error("Customer not found.");
    if (user.role === 'admin') throw new Error("Permission denied.");

    user.status = user.status === "active" ? "blocked" : "active";
    await user.save();
    return user;
};