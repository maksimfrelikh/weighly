// Env interpolation patterns MUST NOT trigger the scanner.
export const databaseConfig = {
  password: "${POSTGRES_PASSWORD}",
  adminPassword: "$ADMIN_PASSWORD",
  pwd: "${DB_PWD}",
};
