const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');

exports.getHotels = async (req, res, next) => {
    try {
        let query;
        const reqQuery = { ...req.query };
        const removeFields = ['select', 'sort', 'page', 'limit'];
        removeFields.forEach(param => delete reqQuery[param]);

        let queryString = JSON.stringify(reqQuery);
        queryString = queryString.replace(/\b(gt|gte|lt|lte|in|ne)\b/g, match => `$${match}`);

        query = Hotel.find(JSON.parse(queryString)).populate('bookings');

        // Select fields
        if (req.query.select) {
            const fields = req.query.select.split(',').join(' ');
            query = query.select(fields);
        }

        // Sort
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            query = query.sort('-createdAt');
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const total = await Hotel.countDocuments();

        query = query.skip(startIndex).limit(limit);

        const hotels = await query;

        const pagination = {};
        if (endIndex < total) {
            pagination.next = {
                page: page + 1,
                limit
            };
        }

        if (startIndex > 0) {
            pagination.prev = {
                page: page - 1,
                limit
            };
        }

        res.status(200).json({
            success: true,
            count: hotels.length,
            pagination,
            data: hotels
        });

    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

exports.getHotel = async (req, res, next) => {
    try {
        const hotel = await Hotel.findById(req.params.id);

        if (!hotel) {
            return res.status(404).json({
                success: false,
                message: 'Hotel not found'
            });
        }

        res.status(200).json({
            success: true,
            data: hotel
        });

    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

exports.createHotel = async (req, res, next) => {
    try {
        const hotel = await Hotel.create(req.body);

        res.status(201).json({
            success: true,
            data: hotel
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

exports.updateHotel = async (req, res, next) => {
    try {
        let hotel = await Hotel.findById(req.params.id);

        if (!hotel) {
            return res.status(404).json({
                success: false,
                message: 'Hotel not found'
            });
        }

        // Check if owner is authorized to update this hotel
        if (req.user.role === 'owner') {
            // Owner can only update hotels they own
            if (!hotel.ownerId || hotel.ownerId.toString() !== req.user.id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: `You are not authorized to update this hotel`
                });
            }
        }

        hotel = await Hotel.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            data: hotel
        });

    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

exports.deleteHotel = async (req, res, next) => {
    try {
        const hotel = await Hotel.findById(req.params.id);

        if (!hotel) {
            return res.status(404).json({
                success: false,
                message: 'Hotel not found'
            });
        }

        await Booking.deleteMany({ hotel: req.params.id });
        await Hotel.deleteOne({ _id: req.params.id });

        res.status(200).json({
            success: true,
            data: {}
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Get hotel financial statistics
// @route   GET /api/v1/hotels/:hotelId/financial
// @access  Private (Owner/Admin)
exports.getFinancialStats = async (req, res, next) => {
    try {
        const { hotelId } = req.params;
        const { startDate, endDate } = req.query;

        // 1. ตรวจสอบว่ามีโรงแรมนี้หรือไม่ และดึงข้อมูลโรงแรมมา
        const hotel = await Hotel.findById(hotelId);
        if (!hotel) {
            return res.status(404).json({ success: false, message: 'Hotel not found' });
        }

        // ตรวจสอบสิทธิ์ว่า Owner คนนี้เป็นเจ้าของโรงแรมนี้จริงๆ (ถ้าไม่ใช่ Admin)
        if (req.user.role === 'owner') {
            if (!hotel.ownerId || hotel.ownerId.toString() !== req.user.id.toString()) {
                return res.status(403).json({ success: false, message: 'Not authorized to view financials for this hotel' });
            }
        }

        // 2. สร้างเงื่อนไขการค้นหา (เอาเฉพาะที่จ่ายเงินแล้ว)
        const query = {
            hotel: hotelId,
            paymentStatus: 'paid' 
        };

        // ถ้ามีการส่ง Date Range มา ให้กรองตามวันที่ Check-In
        if (startDate && endDate) {
            query.checkInDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // 3. ดึงข้อมูล Bookings และ Populate ข้อมูล User เพื่อเอาชื่อและอีเมล
        const bookings = await Booking.find(query).populate({
            path: 'user',
            select: 'name email'
        });

        // 4. คำนวณสถิติต่างๆ
        let totalRevenue = 0;
        let totalNights = 0;

        const formattedBookings = bookings.map(b => {
            totalRevenue += b.totalPrice;
            const nights = b.numberOfNights || 1;
            totalNights += nights;

            return {
                bookingId: b._id.toString().substring(0, 6).toUpperCase(), // จำลองเลข Booking ID สั้นๆ
                guestName: b.user ? b.user.name : 'Unknown Guest',
                guestEmail: b.user ? b.user.email : 'No Email',
                checkInDate: b.checkInDate.toISOString().split('T')[0], // เอาเฉพาะ YYYY-MM-DD
                nights: nights,
                amount: b.totalPrice
            };
        });

        const totalBookings = bookings.length;
        // คำนวณ ADR (Average Daily Rate) = รายได้รวม / จำนวนคืนทั้งหมดที่ขายได้
        const averageDailyRate = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;

        // ส่ง Response กลับไปให้หน้าตาเหมือนที่ Frontend ต้องการ
        res.status(200).json({
            success: true,
            hotelId: hotel._id,
            hotelName: hotel.name,
            startDate: startDate || null,
            endDate: endDate || null,
            totalRevenue,
            totalBookings,
            averageDailyRate,
            bookings: formattedBookings
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Export financial data to CSV
// @route   GET /api/v1/hotels/:hotelId/financial/export
// @access  Private (Owner/Admin)
exports.exportFinancialCSV = async (req, res, next) => {
    try {
        const { hotelId } = req.params;
        const { startDate, endDate } = req.query;

        // เพื่อความชัวร์และข้อมูลตรงกัน เราจะดึงข้อมูลแบบเดียวกับด้านบนเป๊ะๆ
        const query = { hotel: hotelId, paymentStatus: 'paid' };
        if (startDate && endDate) {
            query.checkInDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const bookings = await Booking.find(query).populate('user', 'name email');

        // สร้าง Header ของไฟล์ CSV
        let csvData = 'Booking ID,Guest Name,Guest Email,Check-in Date,Nights,Amount (THB)\n';

        // วนลูปสร้างข้อมูลแต่ละแถว (Row)
        bookings.forEach(b => {
            const bookingId = b._id.toString().substring(0, 6).toUpperCase();
            const guestName = b.user ? `"${b.user.name}"` : '"Unknown"'; // ใส่ "" คลุมเผื่อชื่อมีเว้นวรรค
            const guestEmail = b.user ? b.user.email : 'Unknown';
            const checkInDate = b.checkInDate.toISOString().split('T')[0];
            const nights = b.numberOfNights || 1;
            const amount = b.totalPrice;

            // ต่อ String ลงไปใน CSV
            csvData += `${bookingId},${guestName},${guestEmail},${checkInDate},${nights},${amount}\n`;
        });

        // กำหนด Header ของ Response ให้เบราว์เซอร์รู้ว่านี่คือการดาวน์โหลดไฟล์ CSV
        const filename = `financial_report_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        // ส่ง String ของ CSV กลับไปตรงๆ
        res.status(200).send(csvData);

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get booking requests for a specific hotel (owner/admin)
// @route   GET /api/v1/hotels/:hotelId/booking-requests
// @access  Private (Owner/Admin)
exports.getHotelBookingRequests = async (req, res, next) => {
    try {
        const { hotelId } = req.params;

        // Owner can only see requests for their own hotel
        if (req.user.role === 'owner' && req.user.hotel && req.user.hotel.toString() !== hotelId) {
            return res.status(403).json({ success: false, message: 'Not authorized to view requests for this hotel' });
        }

        // Get all bookings for this hotel first
        const Booking = require('../models/Booking');
        const BookingRequest = require('../models/BookingRequest');

        const hotelBookings = await Booking.find({ hotel: hotelId }).select('_id');
        const bookingIds = hotelBookings.map(b => b._id);

        const filter = { booking: { $in: bookingIds } };
        if (req.query.status) filter.status = req.query.status;

        const requests = await BookingRequest.find(filter)
            .populate({
                path: 'booking',
                select: 'checkInDate numberOfNights hotel status',
                populate: { path: 'hotel', select: 'name' }
            })
            .populate({ path: 'requestedBy', select: 'name email' })
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

// @desc    Get dashboard statistics for a hotel
// @route   GET /api/v1/hotels/:hotelId/dashboard
// @access  Private (Owner/Admin)
exports.getHotelDashboard = async (req, res, next) => {
    try {
        const { hotelId } = req.params;

        // Check authorization for owners
        if (req.user.role === 'owner') {
            const hotel = await Hotel.findById(hotelId);
            if (!hotel) {
                return res.status(404).json({ success: false, message: 'Hotel not found' });
            }
            if (!hotel.ownerId || hotel.ownerId.toString() !== req.user.id.toString()) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Not authorized to view dashboard for this hotel' 
                });
            }
        }

        // 2. นับจำนวน Bookings แยกตามสถานะ (ใช้แสดงเป็นตัวเลขสรุป)
        const totalBookings = await Booking.countDocuments({ hotel: hotelId });
        const confirmedBookings = await Booking.countDocuments({ hotel: hotelId, status: 'confirmed' });
        const cancelledBookings = await Booking.countDocuments({ hotel: hotelId, status: 'cancelled' });

        // 3. คำนวณรายได้รวมทั้งหมด (จาก Booking ที่จ่ายเงินแล้ว)
        const paidBookings = await Booking.find({ hotel: hotelId, paymentStatus: 'paid' });
        const totalRevenue = paidBookings.reduce((sum, b) => sum + b.totalPrice, 0);

        // 4. ดึงรายการจองล่าสุด 5 รายการ (เพื่อแสดงในตาราง Recent Bookings หน้า Dashboard)
        const recentBookings = await Booking.find({ hotel: hotelId })
            .sort('-createdAt')
            .limit(5)
            .populate({
                path: 'user',
                select: 'name email'
            });

        // ส่งข้อมูลกลับไปให้ Frontend
        res.status(200).json({
            success: true,
            data: {
                overview: {
                    totalBookings,
                    confirmedBookings,
                    cancelledBookings,
                    totalRevenue
                },
                recentBookings
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get hotels owned by the current owner
// @route   GET /api/v1/hotels/my-hotels
// @access  Private (Owner only)
exports.getMyHotels = async (req, res, next) => {
    try {
        // Find all hotels where ownerId matches the logged-in user's ID
        const hotels = await Hotel.find({ ownerId: req.user.id });

        res.status(200).json({
            success: true,
            count: hotels.length,
            data: hotels
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

const User = require('../models/User');

// @desc    Check room availability for a hotel on given dates
// @route   GET /api/v1/hotels/:hotelId/availability?checkInDate=&numberOfNights=&roomType=&excludeBookingId=
// @access  Public
exports.checkAvailability = async (req, res, next) => {
    try {
        const { hotelId } = req.params;
        const { checkInDate, numberOfNights, roomType, excludeBookingId } = req.query;

        if (!checkInDate || !numberOfNights) {
            return res.status(400).json({
                success: false,
                message: 'checkInDate and numberOfNights are required'
            });
        }

        const hotel = await Hotel.findById(hotelId);
        if (!hotel) {
            return res.status(404).json({ success: false, message: 'Hotel not found' });
        }

        const nights = Number(numberOfNights);
        const checkIn  = new Date(checkInDate);
        const checkOut = new Date(checkIn.getTime() + nights * 24 * 60 * 60 * 1000);

        // Build availability for each room type (or just the requested one)
        const roomTypesToCheck = roomType
            ? hotel.roomTypes.filter(rt => rt.id === roomType)
            : hotel.roomTypes;

        const availability = await Promise.all(
            roomTypesToCheck.map(async (rt) => {
                // Count bookings that overlap with the requested period
                // Overlap condition: booking.checkInDate < checkOut AND booking.checkInDate + nights*day > checkIn
                // Since we don't store checkOutDate, we use $expr with $add
                const query = {
                    hotel: hotelId,
                    roomType: rt.id,
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
                };

                // Exclude current booking when checking for edit (avoid self-conflict)
                if (excludeBookingId) {
                    query._id = { $ne: excludeBookingId };
                }

                const bookedCount = await Booking.countDocuments(query);
                const totalRooms  = rt.totalRooms || 0;
                const available   = Math.max(0, totalRooms - bookedCount);

                return {
                    roomType:   rt.id,
                    name:       rt.name,
                    totalRooms,
                    booked:     bookedCount,
                    available,
                    isAvailable: available > 0
                };
            })
        );

        const requestedResult = roomType ? availability[0] : null;

        res.status(200).json({
            success: true,
            hotelId,
            checkInDate,
            numberOfNights: nights,
            availability,
            // Convenience field when checking a specific room type
            ...(requestedResult && {
                isAvailable:    requestedResult.isAvailable,
                availableRooms: requestedResult.available
            })
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get global platform statistics + per-hotel breakdown for Admin Dashboard
// @route   GET /api/v1/hotels/admin/dashboard
// @access  Private (Admin only)
exports.getAdminPlatformStats = async (req, res, next) => {
    try {
        // --- Platform-wide counts (parallel) ---
        const [totalUsers, totalOwners, totalHotels, totalBookings, confirmedBookings, cancelledBookings] =
            await Promise.all([
                User.countDocuments(),
                User.countDocuments({ role: 'owner' }),
                Hotel.countDocuments(),
                Booking.countDocuments(),
                Booking.countDocuments({ status: 'confirmed' }),
                Booking.countDocuments({ status: 'cancelled' }),
            ]);

        // --- Fetch all bookings once for revenue + per-hotel stats ---
        const [allBookings, hotels, globalRecentBookings] = await Promise.all([
            Booking.find().select('hotel checkInDate totalPrice status paymentStatus roomType'),
            Hotel.find().select('name roomTypes'),
            Booking.find()
                .sort('-createdAt')
                .limit(10)
                .populate({ path: 'hotel', select: 'name' })
                .populate({ path: 'user',  select: 'name email' }),
        ]);

        const totalPlatformRevenue = allBookings
            .filter(b => b.paymentStatus === 'paid')
            .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

        // --- Per-hotel stats (group in memory — no extra DB round-trips) ---
        const bookingsByHotel = {};
        allBookings.forEach(b => {
            const id = b.hotel.toString();
            if (!bookingsByHotel[id]) bookingsByHotel[id] = [];
            bookingsByHotel[id].push(b);
        });

        const hotelStats = hotels.map(hotel => {
            const hBookings = bookingsByHotel[hotel._id.toString()] || [];
            const monthlyBookings = Array(12).fill(0);
            let totalRevenue = 0;
            let pendingBookings = 0;

            // Room type occupancy counters
            const roomTypeCounts = { standard: 0, deluxe: 0, suite: 0 };

            hBookings.forEach(b => {
                const month = new Date(b.checkInDate).getMonth();
                if (month >= 0 && month < 12) monthlyBookings[month]++;
                if (b.paymentStatus === 'paid') totalRevenue += (b.totalPrice || 0);
                if (b.status === 'pending') pendingBookings++;
                if (b.roomType && roomTypeCounts[b.roomType] !== undefined) {
                    roomTypeCounts[b.roomType]++;
                }
            });

            const totalRoomBookings = hBookings.length || 1; // avoid divide-by-zero

            // Build occupancy using totalRooms from hotel definition if available
            const ROOM_DEFS = [
                { type: 'standard', label: 'Standard Room' },
                { type: 'deluxe',   label: 'Deluxe Room'   },
                { type: 'suite',    label: 'Suite Room'    },
            ];

            const roomTypeOccupancy = ROOM_DEFS.map(def => {
                const count = roomTypeCounts[def.type] || 0;
                // If hotel has roomTypes defined, use totalRooms for real occupancy %
                const hotelRoomDef = hotel.roomTypes && hotel.roomTypes.find(rt => rt.id === def.type);
                const totalRooms = hotelRoomDef ? hotelRoomDef.totalRooms : null;
                const rate = totalRooms
                    ? Math.min(100, Math.round((count / totalRooms) * 100))
                    : Math.round((count / totalRoomBookings) * 100);
                return { type: def.type, label: def.label, count, rate, totalRooms };
            });

            return {
                _id:             hotel._id,
                name:            hotel.name,
                totalBookings:   hBookings.length,
                totalRevenue,
                pendingBookings,
                monthlyBookings,
                roomTypeOccupancy,
            };
        });

        res.status(200).json({
            success: true,
            data: {
                platformStats: {
                    users:    { total: totalUsers, owners: totalOwners },
                    hotels:   { total: totalHotels },
                    bookings: {
                        total: totalBookings,
                        confirmed: confirmedBookings,
                        cancelled: cancelledBookings,
                        totalRevenue: totalPlatformRevenue,
                    },
                },
                hotelStats,
                recentActivity: globalRecentBookings,
            },
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};