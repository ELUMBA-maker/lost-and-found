import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

export const sendVerificationEmail = async (email, code) => {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Lost & Found Email Verification",
        text: `Your verification code is ${code}. It expires in 10 minutes.`
    });
};