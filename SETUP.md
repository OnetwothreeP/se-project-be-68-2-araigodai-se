# Backend Setup Guide

## Current Status
✅ Backend is running successfully on http://localhost:5000
✅ MongoDB connected successfully
✅ All routes configured properly

## Environment Configuration
The backend uses `config/config.env` for environment variables:
- PORT: 5000
- NODE_ENV: development
- MONGO_URI: Connected to MongoDB Atlas
- JWT_SECRET: Configured
- JWT_EXPIRE: 30d
- JWT_COOKIE_EXPIRE: 30

## Available Endpoints

### Authentication
- POST `/api/v1/auth/register` - Register new user
- POST `/api/v1/auth/login` - Login user
- GET `/api/v1/auth/me` - Get current user profile (requires auth)
- PUT `/api/v1/auth/me` - Update user profile (requires auth) ⭐ NEW
- GET `/api/v1/auth/logout` - Logout user

### Hotels
- GET `/api/v1/hotels` - Get all hotels
- GET `/api/v1/hotels/:id` - Get single hotel
- POST `/api/v1/hotels` - Create hotel (admin only)
- PUT `/api/v1/hotels/:id` - Update hotel (admin only)
- DELETE `/api/v1/hotels/:id` - Delete hotel (admin only)

### Bookings
- GET `/api/v1/bookings` - Get all bookings (admin) or user's bookings
- GET `/api/v1/bookings/:id` - Get single booking
- POST `/api/v1/hotels/:hotelId/bookings` - Create booking
- PUT `/api/v1/bookings/:id` - Update booking
- DELETE `/api/v1/bookings/:id` - Delete booking

## New Features Added

### User Profile with Thai Address
The User model now includes Thai address fields:
- houseNumber (บ้านเลขที่)
- village (หมู่บ้าน)
- lane (ซอย)
- road (ถนน)
- subDistrict (ตำบล/แขวง)
- district (อำเภอ/เขต)
- province (จังหวัด)
- postalCode (รหัสไปรษณีย์)

### Update Profile Endpoint
PUT `/api/v1/auth/me`
- Updates user profile including address fields
- Requires authentication
- Returns updated user data

## Running the Backend

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production mode
npm start
```

## API Documentation
Swagger documentation available at: http://localhost:5000/api-docs

## Testing
```bash
# Run tests
npm test

# Run tests with verbose output
npm run test:verbose
```
