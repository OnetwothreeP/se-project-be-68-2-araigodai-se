const { setServers } = require("node:dns/promises");
setServers(["1.1.1.1", "8.8.8.8"]);

const {xss} = require('express-xss-sanitizer');
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 10*60*1000,
    max: 100
});
const hpp = require('hpp');

const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUI = require('swagger-ui-express');

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Hotel Booking API',
      version: '1.0.0',
      description: 'A Hotel Booking System API'
    },
    servers:[
        {
            url: process.env.NODE_ENV === 'production' 
                ? `${process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com'}/api/v1`
                : 'http://localhost:5000/api/v1'
        }
    ],
  },
  apis: ['./routes/*.js'],
};


const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');

// Load environment variables - works with both local .env file and Render environment variables
if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: './config/config.env' });
}

const hotels = require('./routes/hotels');
const bookings = require('./routes/bookings');

const auth = require('./routes/auth');

const connectDB = require('./config/db');

//const mongoSanitize = require('express-mongo-sanitize');

// ค่อย connect DB
connectDB();

const swaggerDocs = swaggerJsDoc(swaggerOptions);

const app = express();

// Trust proxy - required for Render and other reverse proxies
// This allows rate limiting and other features to work correctly
app.set('trust proxy', 1);

// Set timeout for all requests (30 seconds)
app.use((req, res, next) => {
    req.setTimeout(30000);
    res.setTimeout(30000);
    next();
});

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
}));
app.use(helmet());
app.use(xss());
app.use(limiter);
app.use(hpp());
// app.use(mongoSanitize());
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDocs));
app.use('/api/v1/hotels', hotels);
app.use('/api/v1/auth', auth);
app.use('/api/v1/bookings', bookings);
app.set('query parser', 'extended');

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
    res.status(200).send("Hotel Booking System API is running - Use Postman to test endpoints at /api/v1");
});

const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
    console.log(`Test with Postman at http://localhost:${PORT}/api/v1`);
});

// Set server timeout to 30 seconds
server.timeout = 30000;

process.on('unhandledRejection', (err)=> {
    console.log(`Error: ${err.message}`);
    server.close(()=>process.exit(1));
});