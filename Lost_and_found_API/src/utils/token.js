import jwt from "jsonwebtoken";

function getRequiredSecret(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `${name} is missing. Add it to the environment before starting the API.`,
    );
  }

  return value;
}

export function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    getRequiredSecret("JWT_ACCESS_SECRET"),
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
    },
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
    },
    getRequiredSecret("JWT_REFRESH_SECRET"),
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
    },
  );
}