const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    checkInDate: {
        type: Date,
        required: [true, 'Please add a check-in date']
    },
    numberOfNights: {
        type: Number,
        required: [true, 'Please add number of nights'],
        min: [1, 'Number of nights must be at least 1'],
        max: [3, 'Number of nights cannot exceed 3']
    },
    totalPrice: {
        type: Number,
        default: 0,
        min: [0, 'Total price cannot be negative']
    },
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'paid', 'pending_additional_payment', 'partial_refund', 'refunded'],
        default: 'paid'
    },
    paidAt: {
        type: Date,
        default: Date.now
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    hotel: {
        type: mongoose.Schema.ObjectId,
        ref: 'Hotel',
        required: true
    },

    status: {
        type: String,
        enum: ['confirmed', 'pending', 'cancelled'],
        default: 'confirmed'
    },

    cancelledBy: {
        type: String,
        enum: ['owner', 'user', 'admin'],
        default: null
    },

    cancellationReason: {
        type: String,
        default: null
    },
    
    updateReason: {
        type: String,
        default: null
    },
    refundRate: {
        type: Number,
        default: 0
    },
    refundAmount: {
        type: Number,
        default: 0,
        min: [0, 'Refund amount cannot be negative']
    },
    amountPaid: {
        type: Number,
        default: 0,
        min: [0, 'Amount paid cannot be negative']
    },
    pendingPaymentAmount: {
        type: Number,
        default: 0,
        min: [0, 'Pending payment amount cannot be negative']
    },
    lastPriceDifference: {
        type: Number,
        default: 0
    },
    cancelledAt: {
        type: Date,
        default: null
    },

    // Room type selected at booking time (matches frontend ROOM_TYPES ids: standard | deluxe | suite)
    roomType: {
        type: String,
        enum: ['standard', 'deluxe', 'suite'],
        default: null
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Booking', BookingSchema);