// MongoDB initialization script
print('Starting MongoDB initialization...');

// Switch to the application database
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'tg-bono');

// Create application user with read/write permissions
db.createUser({
  user: 'app_user',
  pwd: 'app_password_change_in_production',
  roles: [
    {
      role: 'readWrite',
      db: process.env.MONGO_INITDB_DATABASE || 'tg-bono'
    }
  ]
});

// Create indexes for better performance
print('Creating indexes...');

// Users collection indexes
db.users.createIndex({ "telegramId": 1 }, { unique: true });
db.users.createIndex({ "role": 1 });
db.users.createIndex({ "isActive": 1 });

// Categories collection indexes
db.categories.createIndex({ "name": 1 });
db.categories.createIndex({ "isActive": 1 });

// Orders collection indexes
db.orders.createIndex({ "orderNumber": 1 }, { unique: true });
db.orders.createIndex({ "userId": 1 });
db.orders.createIndex({ "categoryId": 1 });
db.orders.createIndex({ "status": 1 });
db.orders.createIndex({ "createdAt": -1 });
db.orders.createIndex({ "userId": 1, "createdAt": -1 });

// Settings collection indexes
db.settings.createIndex({ "key": 1 }, { unique: true });

print('MongoDB initialization completed successfully!');