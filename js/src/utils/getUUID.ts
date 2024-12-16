import crypto from "crypto";

export const getUUID = () => {
  return crypto.randomUUID();
};
