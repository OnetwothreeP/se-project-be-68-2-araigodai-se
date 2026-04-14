const User = require('../models/User');

const sendTokenResponse = (user, statusCode, res) =>{
    const token = user.getSignedJwtToken();

    const options = {
        expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE*24*60*60*1000),
        httpOnly: true
    };

    if (process.env.NODE_ENV === 'production') {
        options.secure = true;
    }
    res.status(statusCode).cookie('token', token, options).json({success: true, token});
}

exports.register = async(req, res, next) => {
    try{
        const { name, telephone, email, password, role } = req.body;

        // Check if email is already registered with a deactivated account
        const existingUser = await User.findOne({ email });
        if (existingUser && !existingUser.isActive) {
            return res.status(400).json({
                success: false,
                message: 'This email is associated with a deactivated account. Please contact support.'
            });
        }

        const user = await User.create({
            name,
            telephone,
            email,
            password,
            role
        });

        sendTokenResponse(user, 200, res);

    } catch(err){
        res.status(400).json({
            success: false,
            message: err.message
        });
        console.log(err.stack);
    }
}

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        msg: 'Please provide an email and password'
      });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid credentials'
      });
    }

    // Check if account is deactivated
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        msg: 'This account has been deactivated. Please contact support.'
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        msg: 'Invalid credentials'
      });
    }

    sendTokenResponse(user, 200, res);

  } catch (err) {
    return res.status(401).json({
      success: false,
      msg: 'Cannot convert email or password to string'
    });
  }
};

exports.logout = async (req, res, next) => {

  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    data: {}
  });

};

exports.getMe = async(req, res, next) => {
    const user = await User.findById(req.user.id);
    res.status(200).json({
        success: true,
        data: user
    });
}

exports.updateProfile = async(req, res, next) => {
    try {
        const fieldsToUpdate = {
            name: req.body.name,
            telephone: req.body.telephone,
            houseNumber: req.body.houseNumber,
            village: req.body.village,
            lane: req.body.lane,
            road: req.body.road,
            subDistrict: req.body.subDistrict,
            district: req.body.district,
            province: req.body.province,
            postalCode: req.body.postalCode
        };

        const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: user
        });
    } catch(err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

exports.deactivateAccount = async(req, res, next) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.user.id, 
            { isActive: false },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Clear the token cookie
        res.cookie('token', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true
        });

        res.status(200).json({
            success: true,
            message: 'Account deactivated successfully'
        });
    } catch(err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
}