import * as userService from "../services/userService.js"; // Ensure this filename is correct

export const loadHome = (req, res) => {
  console.log("Home rendered");
  res.render("user/home", { title: "SmartPick" });
};

export const logout = (req, res) => {
  req.session.user = null;
  req.session.userId = null;

  // Backup admin data since req.logout regenerates/destroys the session
  const adminId = req.session.adminId;
  const adminData = req.session.admin;

  if (req.user) {
    req.logout({ keepSessionInfo: true }, (err) => {
      if (err) console.error("Passport logout error:", err);

      // Restore admin session
      if (adminId && adminData) {
        req.session.adminId = adminId;
        req.session.admin = adminData;
      }

      req.session.save((err) => {
        if (err) console.error("Logout error:", err);
        res.redirect("/");
      });
    });
  } else {
    req.session.save((err) => {
      if (err) console.error("Logout error:", err);
      res.redirect("/");
    });
  }
};



