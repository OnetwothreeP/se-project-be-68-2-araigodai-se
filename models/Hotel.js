const mongoose = require('mongoose');

const HotelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a hotel name'],
        unique: true,
        trim: true,
        maxlength: [100, 'Name cannot be more than 100 characters']
    },
    address: {
        type: String,
        required: [true, 'Please add an address']
    },
    telephone: {
        type: String,
        required: [true, 'Please add a telephone number']
    },

    // เพิ่มใหม่ (US4-5)
    description: {
        type: String
    },
    amenities: {
        type: [String],
        default: []
    },

    // เพิ่มใหม่ — ใช้คำนวณ Financial Report (US4-2)
    pricePerNight: {
        type: Number
    },

    // Room types — each hotel defines its own room types with individual pricing
    roomTypes: {
        type: [{
            id: {
                type: String,
                required: true,
                enum: ['standard', 'deluxe', 'suite']
            },
            name: {
                type: String,
                required: true
            },
            pricePerNight: {
                type: Number,
                required: true,
                min: [0, 'Price cannot be negative']
            },
            totalRooms: {
                type: Number,
                required: true,
                min: [1, 'Must have at least 1 room'],
                default: 10
            },
            amenities: {
                type: [String],
                default: []
            }
        }],
        default: []
    },

    // เพิ่มใหม่ — owner ของโรงแรม
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

HotelSchema.virtual('bookings', {
    ref: 'Booking',
    localField: '_id',
    foreignField: 'hotel',
    justOne: false
});

module.exports = mongoose.model('Hotel', HotelSchema);