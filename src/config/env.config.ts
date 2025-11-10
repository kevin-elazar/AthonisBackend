export const config = {
  database: {
    type: process.env.DB_TYPE || 'sqlite',
    database: process.env.DB_NAME || './src/database/database.sqlite',
  },
  port: process.env.PORT || 3000,
};