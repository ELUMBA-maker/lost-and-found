export const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const code = generateOTP();

const expires = new Date(Date.now() + 15 * 60 * 1000);