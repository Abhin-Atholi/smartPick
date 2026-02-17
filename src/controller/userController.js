

const loadHome = (req,res)=>{
    console.log("Home rendered");
    res.render("user/home", {  title: "SmartPick" });
};
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log("Logout error:", err);
      return res.redirect("/");
    }

    res.clearCookie("connect.sid"); // removes session cookie
    res.redirect("/");
  });
};



module.exports={loadHome,logout}
