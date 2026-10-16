import nodemailer from "nodemailer";

export const sendVerificationEmail = async (email, code,exp) => {
    if (
        !process.env.EMAIL_HOST ||
        !process.env.EMAIL_PORT ||
        !process.env.EMAIL_USER ||
        !process.env.EMAIL_PASSWORD ||
        !process.env.EMAIL_FROM
    ) {
        throw new Error("Email delivery is not configured");
    }

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Lost & Found Email Verification",
        text: `Your verification code is ${code}. It expires in ${exp} minutes.`
    });
};