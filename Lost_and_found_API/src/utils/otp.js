import crypto from "crypto";
import { sendVerificationEmail } from "../utils/email.js";

export const generateOTP = () => {
    return crypto.randomInt(100000, 1000000).toString();
};

export const getOTPExpiration = () => {
    return new Date(Date.now() + 10 * 60 * 1000);
};
