const Booking = require('../models/Booking');
const BookingRequest = require('../models/BookingRequest');
const Hotel = require('../models/Hotel');

const HOUR_IN_MS = 60 * 60 * 1000;

const toMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

const getRefundRateByPolicy = (checkInDate) => {
    const hoursBeforeCheckIn = (new Date(checkInDate).getTime() - Date.now()) / HOUR_IN_MS;

    if (hoursBeforeCheckIn >= 72) {
        return 1;
    }

    if (hoursBeforeCheckIn < 24) {
        return 0;
    }

    return 0.5;
};

const getBookingTotalPrice = (booking) => {
    const byField = Number(booking.totalPrice);
    if (byField > 0) {
        return byField;
    }

    const fallback = (Number(booking.hotel?.pricePerNight) || 0) * Number(booking.numberOfNights || 0);
    return toMoney(fallback);
};

const applyCancellationPolicy = async (booking, user, reason) => {
    if (booking.status === 'cancelled') {
        return {
            success: false,
            code: 400,
            message: 'This booking cannot be cancelled'
        };
    }

    if ((user.role === 'admin' || user.role === 'owner') && !reason) {
        return {
            success: false,
            code: 400,
            message: 'Please provide a reason for canceling booking.'
        };
    }

    const fallbackTotalPrice = getBookingTotalPrice(booking);
    const paidAmount = Number(booking.amountPaid) > 0 ? Number(booking.amountPaid) : fallbackTotalPrice;
    const refundRate = getRefundRateByPolicy(booking.checkInDate);
    const refundAmount = booking.paymentStatus === 'unpaid' ? 0 : toMoney(paidAmount * refundRate);

    booking.status = 'cancelled';
    booking.cancelledBy = user.role === 'admin' ? 'admin' : (user.role === 'owner' ? 'owner' : 'user');
    booking.cancellationReason = reason || null;
    booking.cancelledAt = new Date();
    booking.pendingPaymentAmount = 0;
    booking.lastPriceDifference = 0;
    booking.refundRate = refundRate;
    booking.refundAmount = refundAmount;

    if (booking.paymentStatus !== 'unpaid') {
        if (refundRate === 1) {
            booking.paymentStatus = 'refunded';
        } else if (refundRate === 0.5) {
            booking.paymentStatus = 'partial_refund';
        }
    }

    if (booking.paymentStatus === 'refunded') {
        booking.amountPaid = 0;
    } else if (booking.paymentStatus === 'partial_refund') {
        booking.amountPaid = toMoney(Math.max(0, paidAmount - refundAmount));
    }

    await booking.save();

    return {
        success: true,
        booking
    };
};

// @desc    Get all bookings
// @route   GET /api/v1/bookings (admin) or /api/v1/hotels/:hotelId/bookings (admin/owner)
// @access  Private
exports.getBookings = async (req, res, next) => {
    let query;

    if (req.user.role === 'admin') {
        // Admin: filter by hotel if hotelId param present, otherwise all bookings
        const filter = req.params.hotelId ? { hotel: req.params.hotelId } : {};
        query = Booking.find(filter)
            .populate({ path: 'hotel', select: 'name address telephone' })
            .populate({ path: 'user', select: 'name email' });
    } else if (req.user.role === 'owner') {
        // Owner: must provide hotelId; verify ownership before returning bookings
        if (!req.params.hotelId) {
            return res.status(400).json({ success: false, message: 'hotelId is required for owner' });
        }
        const hotel = await Hotel.findById(req.params.hotelId);
        if (!hotel) {
            return res.status(404).json({ success: false, message: 'Hotel not found' });
        }
        if (!hotel.ownerId || hotel.ownerId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to view bookings for this hotel' });
        }
        query = Booking.find({ hotel: req.params.hotelId })
            .populate({ path: 'hotel', select: 'name address telephone' })
            .populate({ path: 'user', select: 'name email' });
    } else {
        // Regular user: only their own bookings
        query = Booking.find({ user: req.user.id })
            .populate({ path: 'hotel', select: 'name address telephone' });
    }

    try {
        const bookings = await query;

        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot find bookings'
        });
    }
};

// @desc    Get single booking
// @route   GET /api/v1/bookings/:id
// @access  Private
exports.getBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id).populate({
            path: 'hotel',
            select: 'name address telephone'
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `No booking with the id of ${req.params.id}`
            });
        }

        if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: `User ${req.user.id} is not authorized to view this booking`
            });
        }

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot find booking'
        });
    }
};

// @desc    Add booking
// @route   POST /api/v1/hotels/:hotelId/bookings
// @access  Private
exports.addBooking = async (req, res, next) => {
    try {
        req.body.hotel = req.params.hotelId;
        const hotel = await Hotel.findById(req.params.hotelId);

        if (!hotel) {
            return res.status(404).json({
                success: false,
                message: `No hotel with the id of ${req.params.hotelId}`
            });
        }

        if (req.body.numberOfNights > 3) {
            return res.status(400).json({
                success: false,
                message: 'Number of nights cannot exceed 3'
            });
        }

        req.body.user = req.user.id;

        // Persist roomType if provided by the frontend
        if (req.body.roomType) {
            const validRoomTypes = ['standard', 'deluxe', 'suite'];
            if (!validRoomTypes.includes(req.body.roomType)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid room type. Must be one of: ${validRoomTypes.join(', ')}`
                });
            }
        }

        // Calculate price: use room type price if hotel has roomTypes defined, else fall back to hotel.pricePerNight
        let pricePerNight = 0;
        if (req.body.roomType && hotel.roomTypes && hotel.roomTypes.length > 0) {
            const roomTypeDef = hotel.roomTypes.find(rt => rt.id === req.body.roomType);
            if (roomTypeDef) {
                pricePerNight = Number(roomTypeDef.pricePerNight) || 0;
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Room type "${req.body.roomType}" is not available at this hotel.`
                });
            }
        } else {
            pricePerNight = Number(hotel.pricePerNight) || 0;
        }

        req.body.totalPrice = toMoney(pricePerNight * req.body.numberOfNights);
        req.body.amountPaid = 0;
        req.body.paymentStatus = 'unpaid';
        req.body.status = 'pending';

        // Check room availability before creating booking
        if (req.body.roomType) {
            const roomTypeDef = hotel.roomTypes.find(rt => rt.id === req.body.roomType);
            if (roomTypeDef && roomTypeDef.totalRooms > 0) {
                const checkIn  = new Date(req.body.checkInDate);
                const checkOut = new Date(checkIn.getTime() + req.body.numberOfNights * 24 * 60 * 60 * 1000);

                const overlapping = await Booking.countDocuments({
                    hotel: req.params.hotelId,
                    roomType: req.body.roomType,
                    status: { $ne: 'cancelled' },
                    $expr: {
                        $and: [
                            { $lt: ['$checkInDate', checkOut] },
                            {
                                $gt: [
                                    { $add: ['$checkInDate', { $multiply: ['$numberOfNights', 24 * 60 * 60 * 1000] }] },
                                    checkIn
                                ]
                            }
                        ]
                    }
                });

                if (overlapping >= roomTypeDef.totalRooms) {
                    return res.status(400).json({
                        success: false,
                        message: 'No rooms available on the selected dates.'
                    });
                }
            }
        }

        const booking = await Booking.create(req.body);

        res.status(201).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Cannot create booking'
        });
    }
};

// @desc    Cancel booking with refund policy
// @route   POST /api/v1/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id).populate({
            path: 'hotel',
            select: 'pricePerNight name'
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `No booking with the id of ${req.params.id}`
            });
        }

        // Allow: booking owner, admin, or hotel owner
        const isBookingOwner = booking.user.toString() === req.user.id;
        const isAdmin = req.user.role === 'admin';
        let isHotelOwner = false;
        if (req.user.role === 'owner') {
            const hotel = await Hotel.findById(booking.hotel);
            isHotelOwner = hotel && hotel.ownerId && hotel.ownerId.toString() === req.user.id.toString();
        }

        if (!isBookingOwner && !isAdmin && !isHotelOwner) {
            return res.status(403).json({
                success: false,
                message: `User ${req.user.id} is not authorized to cancel this booking`
            });
        }

        const cancellation = await applyCancellationPolicy(booking, req.user, req.body.reason);

        if (!cancellation.success) {
            return res.status(cancellation.code).json({
                success: false,
                message: cancellation.message
            });
        }

        return res.status(200).json({
            success: true,
            policy: {
                fullRefundHours: '>= 72',
                noRefundHours: '< 24',
                partialRefundHours: '>= 24 and < 72'
            },
            data: cancellation.booking
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot cancel booking'
        });
    }
};

// @desc    Update already-paid booking and compute payment difference
// @route   PATCH /api/v1/bookings/:id/paid-update
// @access  Private
exports.updatePaidBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id).populate({
            path: 'hotel',
            select: 'pricePerNight name'
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `No booking with the id of ${req.params.id}`
            });
        }

        if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: `User ${req.user.id} is not authorized to update this booking`
            });
        }

        const reasonForChange = req.body.updateReason || req.body.reason;
        if (req.user.role === 'admin' && !reasonForChange) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a reason for this change.'
            });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update a cancelled booking'
            });
        }

        const hasPaidAmount = Number(booking.amountPaid) > 0;
        const isPaidState = ['paid', 'partial_refund', 'pending_additional_payment'].includes(booking.paymentStatus);
        if (!hasPaidAmount && !isPaidState) {
            return res.status(400).json({
                success: false,
                message: 'This endpoint is for already-paid bookings'
            });
        }

        const updates = {};
        if (req.body.checkInDate) {
            updates.checkInDate = req.body.checkInDate;
        }

        if (typeof req.body.numberOfNights !== 'undefined') {
            const newNights = Number(req.body.numberOfNights);
            if (newNights > 3 || newNights < 1 || Number.isNaN(newNights)) {
                return res.status(400).json({
                    success: false,
                    message: 'Number of nights must be between 1 and 3'
                });
            }
            updates.numberOfNights = newNights;
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({
                success: false,
                message: 'Please provide checkInDate or numberOfNights to update'
            });
        }

        const oldTotalPrice = getBookingTotalPrice(booking);
        const oldAmountPaid = Number(booking.amountPaid) > 0 ? Number(booking.amountPaid) : oldTotalPrice;

        if (updates.checkInDate) {
            booking.checkInDate = updates.checkInDate;
        }
        if (typeof updates.numberOfNights !== 'undefined') {
            booking.numberOfNights = updates.numberOfNights;
        }

        if (req.user.role === 'admin') {
            booking.updateReason = reasonForChange;
        }

        const pricePerNight = Number(booking.hotel?.pricePerNight) || 0;
        const newTotalPrice = toMoney(pricePerNight * booking.numberOfNights);
        const priceDifference = toMoney(newTotalPrice - oldTotalPrice);

        booking.totalPrice = newTotalPrice;
        booking.lastPriceDifference = priceDifference;
        booking.cancelledBy = null;
        booking.cancellationReason = null;
        booking.cancelledAt = null;

        let action = 'no_price_change';
        let pendingPaymentAmount = 0;
        let refundIssued = 0;

        if (priceDifference > 0) {
            action = 'additional_payment_required';
            pendingPaymentAmount = priceDifference;
            booking.pendingPaymentAmount = pendingPaymentAmount;
            booking.amountPaid = oldAmountPaid;
            booking.status = 'pending';
            booking.paymentStatus = 'pending_additional_payment';
        } else if (priceDifference < 0) {
            action = 'refund_issued';
            refundIssued = Math.abs(priceDifference);
            booking.pendingPaymentAmount = 0;
            booking.amountPaid = toMoney(Math.max(0, oldAmountPaid - refundIssued));
            booking.refundAmount = toMoney((Number(booking.refundAmount) || 0) + refundIssued);
            booking.status = 'confirmed';
            booking.paymentStatus = 'partial_refund';
        } else {
            booking.pendingPaymentAmount = 0;
            booking.amountPaid = toMoney(Math.min(oldAmountPaid, newTotalPrice));
            booking.status = 'confirmed';
            booking.paymentStatus = 'paid';
        }

        await booking.save();

        return res.status(200).json({
            success: true,
            adjustment: {
                oldTotalPrice: toMoney(oldTotalPrice),
                newTotalPrice,
                priceDifference,
                action,
                pendingPaymentAmount,
                refundIssued
            },
            data: booking
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot update paid booking'
        });
    }
};

// @desc    Update booking
// @route   PUT /api/v1/bookings/:id
// @access  Private
exports.updateBooking = async (req, res, next) => {
    try {
        let booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `No booking with the id of ${req.params.id}`
            });
        }

        const isBookingOwner = booking.user.toString() === req.user.id;
        const isAdmin = req.user.role === 'admin';
        let isHotelOwner = false;
        if (req.user.role === 'owner') {
            const hotel = await Hotel.findById(booking.hotel);
            isHotelOwner = hotel && hotel.ownerId && hotel.ownerId.toString() === req.user.id.toString();
        }

        if (!isBookingOwner && !isAdmin && !isHotelOwner) {
            return res.status(403).json({
                success: false,
                message: `User ${req.user.id} is not authorized to update this booking`
            });
        }

        if (req.user.role === 'admin' || req.user.role === 'owner') {
            if (!req.body.updateReason && !req.body.reason) { 
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a reason for this change.'
                });
            }
            req.body.updateReason = req.body.updateReason || req.body.reason;
        }

        if (req.body.numberOfNights && req.body.numberOfNights > 3) {
            return res.status(400).json({
                success: false,
                message: 'Number of nights cannot exceed 3'
            });
        }

        // Check room availability if dates or nights are being changed
        const newCheckInDate = req.body.checkInDate || booking.checkInDate;
        const newNumberOfNights = req.body.numberOfNights || booking.numberOfNights;
        const roomType = booking.roomType;

        if (roomType && (req.body.checkInDate || req.body.numberOfNights)) {
            const hotel = await Hotel.findById(booking.hotel);
            if (hotel) {
                const roomTypeDef = hotel.roomTypes && hotel.roomTypes.find(rt => rt.id === roomType);
                if (roomTypeDef && roomTypeDef.totalRooms > 0) {
                    const checkIn  = new Date(newCheckInDate);
                    const checkOut = new Date(checkIn.getTime() + newNumberOfNights * 24 * 60 * 60 * 1000);

                    const overlapping = await Booking.countDocuments({
                        hotel: booking.hotel,
                        roomType,
                        status: { $ne: 'cancelled' },
                        _id: { $ne: booking._id }, // exclude current booking
                        $expr: {
                            $and: [
                                { $lt: ['$checkInDate', checkOut] },
                                {
                                    $gt: [
                                        { $add: ['$checkInDate', { $multiply: ['$numberOfNights', 24 * 60 * 60 * 1000] }] },
                                        checkIn
                                    ]
                                }
                            ]
                        }
                    });

                    if (overlapping >= roomTypeDef.totalRooms) {
                        return res.status(409).json({
                            success: false,
                            message: 'No rooms available for the selected dates.'
                        });
                    }
                }
            }
        }

        booking = await Booking.findByIdAndUpdate(req.params.id, req.body, {
            returnDocument: 'after',
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot update booking'
        });
    }
};


// @desc    Delete booking (soft cancel with refund policy)
// @route   DELETE /api/v1/bookings/:id
// @access  Private

exports.deleteBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id).populate({
            path: 'hotel',
            select: 'pricePerNight name'
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `No booking with the id of ${req.params.id}`
            });
        }

        if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: `User ${req.user.id} is not authorized to cancel this booking`
            });
        }

        const cancellation = await applyCancellationPolicy(booking, req.user, req.body.reason);

        if (!cancellation.success) {
            return res.status(cancellation.code).json({
                success: false,
                message: cancellation.message
            });
        }

        res.status(200).json({
            success: true,
            policy: {
                fullRefundHours: '>= 72',
                noRefundHours: '< 24',
                partialRefundHours: '>= 24 and < 72'
            },
            data: cancellation.booking
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot delete booking'
        });
    }
};

// @desc    Create a booking request (user submits edit/delete for admin approval)
// @route   POST /api/v1/bookings/:id/request
// @access  Private (User only)
exports.createBookingRequest = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `No booking with the id of ${req.params.id}`
            });
        }

        // Only the booking owner can submit a request
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to submit a request for this booking'
            });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Cannot submit a request for a cancelled booking'
            });
        }

        const { type, newCheckInDate, newNumberOfNights } = req.body;

        if (!['edit', 'delete'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request type. Use "edit" or "delete".'
            });
        }

        if (type === 'edit') {
            if (!newCheckInDate && newNumberOfNights === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide newCheckInDate or newNumberOfNights for an edit request.'
                });
            }
            if (newNumberOfNights !== undefined) {
                const nights = Number(newNumberOfNights);
                if (nights < 1 || nights > 3 || Number.isNaN(nights)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Number of nights must be between 1 and 3'
                    });
                }
            }
        }

        // Check for existing pending request for this booking
        const existing = await BookingRequest.findOne({
            booking: booking._id,
            status: 'pending'
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'A pending request already exists for this booking. Please wait for admin review.'
            });
        }

        const requestData = {
            booking: booking._id,
            type,
            requestedBy: req.user.id,
            ...(type === 'edit' && newCheckInDate    ? { newCheckInDate }    : {}),
            ...(type === 'edit' && newNumberOfNights !== undefined ? { newNumberOfNights: Number(newNumberOfNights) } : {}),
        };

        const request = await BookingRequest.create(requestData);

        // Mark the booking as pending while the request awaits admin review
        booking.status = 'pending';
        await booking.save();

        res.status(201).json({
            success: true,
            message: 'Your request has been submitted and is pending admin approval.',
            data: request
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot create booking request'
        });
    }
};

// @desc    Get booking requests for the current user
// @route   GET /api/v1/bookings/my-requests
// @access  Private (User)
exports.getMyBookingRequests = async (req, res, next) => {
    try {
        const requests = await BookingRequest.find({ requestedBy: req.user.id })
            .populate({
                path: 'booking',
                select: 'checkInDate numberOfNights hotel status',
                populate: { path: 'hotel', select: 'name' }
            })
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get all booking requests — optionally filter by status (?status=pending|approved|rejected)
// @route   GET /api/v1/bookings/requests
// @access  Private (Admin only)
exports.getBookingRequests = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const requests = await BookingRequest.find(filter)
            .populate({
                path: 'booking',
                select: 'checkInDate numberOfNights hotel status',
                populate: { path: 'hotel', select: 'name' }
            })
            .populate({
                path: 'requestedBy',
                select: 'name email'
            })
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Accept or decline user booking request
// @route   PUT /api/v1/bookings/requests/:requestId/respond
// @access  Private (Admin only)
exports.respondToBookingRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { action, reason } = req.body; // action: 'approve' or 'reject'

        if (req.user.role !== 'admin' && req.user.role !== 'owner') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to perform this operation'
            });
        }

        const request = await BookingRequest.findById(requestId).populate('booking');
        if (!request) {
            return res.status(404).json({
                success: false,
                message: `No request with id of ${requestId}`
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'This request has already been processed.'
            });
        }

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a reason for this decision.'
            });
        }

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Use "approve" or "reject".'
            });
        }

        request.status = action === 'approve' ? 'approved' : 'rejected';
        request.adminReason = reason;

        if (action === 'approve') {
            const booking = await Booking.findById(request.booking._id);
            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Booking associated with this request not found'
                });
            }

            if (request.type === 'edit') {
                if (request.newCheckInDate) booking.checkInDate = request.newCheckInDate;
                if (request.newNumberOfNights) booking.numberOfNights = request.newNumberOfNights;
                booking.updateReason = `Approved user edit request: ${reason}`;
                booking.status = 'confirmed'; // restore after pending
                await booking.save();
            } else if (request.type === 'delete') {
                const cancellation = await applyCancellationPolicy(booking, req.user, `Approved user cancel request: ${reason}`);
                if (!cancellation.success) {
                    return res.status(cancellation.code).json({
                        success: false,
                        message: cancellation.message
                    });
                }
            }
        } else {
            // Rejected — restore booking status back to confirmed
            const booking = await Booking.findById(request.booking._id);
            if (booking && booking.status === 'pending') {
                booking.status = 'confirmed';
                await booking.save();
            }
        }

        await request.save();

        // TODO: Send notification to the user about request response

        res.status(200).json({
            success: true,
            data: request
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: 'Cannot process request'
        });
    }
};

// @desc    Mock Payment for Demo purposes
// @route   POST /api/v1/bookings/:id/mock-pay
// @access  Private
exports.mockPayBooking = async (req, res, next) => {
    try {
        let booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'Booking not found' 
            });
        }

        // Ensure the user actually owns this booking
        if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: `User ${req.user.id} is not authorized to pay for this booking` 
            });
        }

        // 1. Simulate network latency (2 seconds) to make the demo look realistic
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        await delay(2000); 

        // 2. Update the database automatically
        booking.paymentStatus = 'paid';
        booking.status = 'confirmed';
        booking.amountPaid = booking.totalPrice; // record actual amount paid
        booking.paidAt = new Date();
        
        // Save the updated booking
        await booking.save();

        // 3. Return a fake transaction ID to the frontend
        res.status(200).json({
            success: true,
            message: 'Payment successful (Mock)',
            transactionId: 'mock_txn_' + Math.floor(Math.random() * 1000000000)
        });

    } catch (err) {
        res.status(500).json({ 
            success: false, 
            message: err.message 
        });
    }
};