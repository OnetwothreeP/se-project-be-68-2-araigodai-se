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

        if (req.user.role === 'owner' && hotel._id.toString() !== req.user.hotel.toString()) {
            return res.status(403).json({
                success: false,
                message: `Owner ${req.user.id} is not authorized to update this hotel`
            });
        }

        hotel = await Hotel.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
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

const Booking = require('../models/Booking');
const Hotel = require('../models/Hotel');

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
        if (req.user.role === 'owner' && req.user.hotel.toString() !== hotelId) {
            return res.status(403).json({ success: false, message: 'Not authorized to view financials for this hotel' });
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

// @desc    Get dashboard statistics for a hotel
// @route   GET /api/v1/hotels/:hotelId/dashboard
// @access  Private (Owner/Admin)
exports.getHotelDashboard = async (req, res, next) => {
    try {
        const { hotelId } = req.params;

        // 1. ตรวจสอบสิทธิ์ว่า Owner คนนี้ดูแลโรงแรมนี้จริงๆ
        if (req.user.role === 'owner' && req.user.hotel.toString() !== hotelId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to view dashboard for this hotel' 
            });
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

const User = require('../models/User');
// (สมมติว่าด้านบนมี const Booking = require('../models/Booking'); และ Hotel อยู่แล้ว)

// @desc    Get global platform statistics for Admin Dashboard
// @route   GET /api/v1/hotels/admin/dashboard
// @access  Private (Admin only)
exports.getAdminPlatformStats = async (req, res, next) => {
    try {
        // 1. สถิติฝั่ง User (นับจำนวน User ทั่วไป และ Owner)
        const totalUsers = await User.countDocuments();
        const totalOwners = await User.countDocuments({ role: 'owner' });

        // 2. สถิติฝั่งโรงแรม
        const totalHotels = await Hotel.countDocuments();

        // 3. สถิติฝั่งการจอง (รวมทุกโรงแรมในระบบ)
        const totalBookings = await Booking.countDocuments();
        const confirmedBookings = await Booking.countDocuments({ status: 'confirmed' });
        const cancelledBookings = await Booking.countDocuments({ status: 'cancelled' });

        // 4. คำนวณรายได้รวมของทั้งแพลตฟอร์ม (Platform Gross Revenue)
        const paidBookings = await Booking.find({ paymentStatus: 'paid' });
        const totalPlatformRevenue = paidBookings.reduce((sum, b) => sum + b.totalPrice, 0);

        // 5. ดึงรายการจองล่าสุดที่เกิดขึ้นในระบบ (10 รายการ) เพื่อแสดงในตาราง Recent Activity
        const globalRecentBookings = await Booking.find()
            .sort('-createdAt')
            .limit(10)
            .populate({
                path: 'hotel',
                select: 'name'
            })
            .populate({
                path: 'user',
                select: 'name email'
            });

        // ส่งข้อมูลรวบยอดกลับไปให้หน้า Frontend Admin Dashboard
        res.status(200).json({
            success: true,
            data: {
                platformStats: {
                    users: {
                        total: totalUsers,
                        owners: totalOwners
                    },
                    hotels: {
                        total: totalHotels
                    },
                    bookings: {
                        total: totalBookings,
                        confirmed: confirmedBookings,
                        cancelled: cancelledBookings,
                        totalRevenue: totalPlatformRevenue
                    }
                },
                recentActivity: globalRecentBookings
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};