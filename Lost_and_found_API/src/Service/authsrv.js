    import pool from "../db.js";
    
    
    
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "name, email and password are  all required"
      });
    }
    if(!/^\d+$/.test(phone)){
      return res.status(400).json({
        message:"Phone must contain numbers only"
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters"
      });
    }
    if(!/[A-Z]/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Upper Case Letter"
      });
    }
      if(!/[a-z]/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Lower Case Letter"
      });
    }
      if(!/\d/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Number"
      });
    }
      if(!/[@$!%*?&]/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Special Case Letter"
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex= /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if(!emailRegex.test(normalizedEmail)){
      return res.status(400).json({
        message:"Use a Valid Email Format"
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }