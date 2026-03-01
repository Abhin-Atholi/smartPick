import * as userService from "../services/userService.js"; // Ensure this filename is correct

export const loadHome = (req, res) => {
  console.log("Home rendered");
  res.render("user/home", { title: "SmartPick" });
};

export const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.redirect("/");
    }

    res.clearCookie("connect.sid"); // removes session cookie
    res.redirect("/");
  });
};

export const loadAccount = (req, res) => {
  return res.render("user/account", { title: "My Account", msg: null });
};

export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;

    const result = await userService.updateProfile(req.session.userId, { firstName, lastName, phone });

    if (!result.ok) {
      return res.render("user/account", { title: "My Account", msg: result.msg });
    }

    // keep session in sync (so navbar/drawer shows new name)
    req.session.user = { ...req.session.user, ...result.user };

    return res.redirect("/account");
  } catch (e) {
    console.error(e);
    return res.status(500).send("Server Error");
  }
};