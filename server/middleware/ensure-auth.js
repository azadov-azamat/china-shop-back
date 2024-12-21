module.exports = function (...roles) {
  return function (req, res, next) {
    if (req.user) {
      if (!roles.length || roles.some(role => req.user.role === role)) {
        return next();
      }
    }

    res.sendStatus(401);
  };
};
