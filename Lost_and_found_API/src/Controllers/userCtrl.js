import pool from "../db.js";

export async function me(req,res) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export async function verify_email (req,res) {
      try {
        const { email, otp } = req.body;

        // Check required fields
        if (!email || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required"
            });
        }

        // Find user
        const result = await pool.query(
            `SELECT id, email_verified, verification_code, verification_expires
             FROM users
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const user = result.rows[0];

        // Check if already verified
        if (user.email_verified) {
            return res.status(400).json({
                message: "Email is already verified"
            });
        }

        // Check whether OTP exists
        if (!user.verification_code) {
            return res.status(400).json({
                message: "No verification code found. Request a new code."
            });
        }

        // Check whether OTP has expired
        if (
            !user.verification_expires ||
            new Date() > new Date(user.verification_expires)
        ) {
            return res.status(400).json({
                message: "Verification code has expired"
            });
        }

        // Check OTP
        if (otp !== user.verification_code) {
            return res.status(400).json({
                message: "Invalid verification code"
            });
        }

        // Verify email and remove OTP
        await pool.query(
            `UPDATE users
             SET email_verified = TRUE,
                 verification_code = NULL,
                 verification_expires = NULL
             WHERE id = $1`,
            [user.id]
        );

        return res.status(200).json({
            message: "Email verified successfully"
        });

    } catch (error) {
        console.error("Email verification error:", error);

        return res.status(500).json({
            message: "Server error"
        });
    }
    await sendVerificationEmail(user.email, otp);
}