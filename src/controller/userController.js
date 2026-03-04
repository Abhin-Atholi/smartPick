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



