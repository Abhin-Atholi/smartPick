import User from "../model/userModel.js"; // Note the .js extension

export const loadAddresses = async (req, res) => {
  const user = await User.findById(req.session.userId).select("addresses");
  return res.render("user/addresses", {
    title: "Saved Addresses",
    addresses: user?.addresses || [],
    msg: null,
  });
};

export const addAddress = async (req, res) => {
  try {
    const { fullName, phone, pincode, state, city, locality, house, area } = req.body;

    if (!fullName || !phone || !pincode || !state || !city || !locality || !house || !area) {
      const user = await User.findById(req.session.userId).select("addresses");
      return res.render("user/addresses", {
        title: "Saved Addresses",
        addresses: user?.addresses || [],
        msg: "All fields are required",
      });
    }

    await User.updateOne(
      { _id: req.session.userId },
      { $push: { addresses: { fullName, phone, pincode, state, city, locality, house, area } } }
    );

    return res.redirect("/account/addresses");
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

export const loadEditAddress = async (req, res) => {
  const user = await User.findById(req.session.userId).select("addresses");
  const address = user?.addresses?.id(req.params.id);

  if (!address) return res.redirect("/account/addresses");

  return res.render("user/edit-address", {
    title: "Edit Address",
    address,
    msg: null,
  });
};

export const updateAddress = async (req, res) => {
  try {
    const { fullName, phone, pincode, state, city, locality, house, area } = req.body;

    if (!fullName || !phone || !pincode || !state || !city || !locality || !house || !area) {
      return res.render("user/edit-address", {
        title: "Edit Address",
        address: { _id: req.params.id, ...req.body },
        msg: "All fields are required",
      });
    }

    await User.updateOne(
      { _id: req.session.userId, "addresses._id": req.params.id },
      {
        $set: {
          "addresses.$.fullName": fullName,
          "addresses.$.phone": phone,
          "addresses.$.pincode": pincode,
          "addresses.$.state": state,
          "addresses.$.city": city,
          "addresses.$.locality": locality,
          "addresses.$.house": house,
          "addresses.$.area": area,
        },
      }
    );

    return res.redirect("/account/addresses");
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

export const deleteAddress = async (req, res) => {
  await User.updateOne(
    { _id: req.session.userId },
    { $pull: { addresses: { _id: req.params.id } } }
  );

  return res.redirect("/account/addresses");
};

export const loadAccount = async (req, res) => {
  const user = await User.findById(req.session.userId);
  return res.render("user/account", {
    title: "My Account",
    user,
    msg: null,
  });
};

export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;

    if (!firstName || !lastName) {
      const user = await User.findById(req.session.userId);
      return res.render("user/account", {
        title: "My Account",
        user,
        msg: "First name and last name are required",
      });
    }

    await User.updateOne(
      { _id: req.session.userId },
      {
        $set: {
          firstName,
          lastName,
          phone,
        },
      }
    );

    // update session user also
    req.session.user.firstName = firstName;
    req.session.user.lastName = lastName;
    req.session.user.phone = phone;

    const updatedUser = await User.findById(req.session.userId);

    return res.render("user/account", {
      title: "My Account",
      user: updatedUser,
      msg: "Profile updated successfully ✅",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};