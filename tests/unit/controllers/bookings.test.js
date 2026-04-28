const { 
    getBookings, getBooking, addBooking, cancelBooking, 
    updatePaidBooking, updateBooking, deleteBooking, 
    createBookingRequest, getMyBookingRequests, getBookingRequests, 
    respondToBookingRequest, mockPayBooking 
} = require('../../../controllers/bookings');
const Booking = require('../../../models/Booking');
const Hotel = require('../../../models/Hotel');
const BookingRequest = require('../../../models/BookingRequest');

// 1. Mock Database 
jest.mock('../../../models/Booking');
jest.mock('../../../models/Hotel');
jest.mock('../../../models/BookingRequest');

describe('Bookings Controller', () => {
    let req, res, next;

    // 2. ตั้งค่าตัวแปรจำลองที่จะถูกเรียกใช้งานก่อนหมุนลูปแต่ละ Test (Setup Mock Request/Response)
    beforeEach(() => {
        req = {
            params: {},
            body: {},
            user: { id: 'test_user_id', role: 'user' } // จำลองว่าเป็น User ทั่วไปล็อกอินมา
        };
        res = {
            status: jest.fn().mockReturnThis(), // จำลองฟังก์ชัน res.status()
            json: jest.fn() // จำลองฟังก์ชัน res.json()
        };
        next = jest.fn();

        jest.spyOn(console, 'log').mockImplementation(() => {}); // ปิดการปริ้นท์ LOG ในตอนเทสเพื่อให้ Terminal สะอาด
    });

    afterEach(() => {
        jest.clearAllMocks(); // ล้างความจำ Mock หลังจบแต่ละเทส
        console.log.mockRestore();
    });

    // ==========================================
    // ฟังก์ชันที่ 1. updatePaidBooking (การแก้ไขการจองที่จ่ายเงินแล้ว)
    // ==========================================
    describe('updatePaidBooking', () => {
        // ทดสอบเคส: ยิงขอแก้ไขแต่หาไอดีการจองไม่เจอ
        test('404 booking not found', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        // ทดสอบเคส: ไม่ใช่เจ้าของบัตรที่จองไว้มาเซ้าซี้ขอเปลี่ยน (Access Control)
        test('403 unauthorized', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { toString: () => 'other' } })
            });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        // ทดสอบเคส: แอดมินมาแก้เอง แต่ไม่ยอมกรอกเหตุผลให้ (Policy)
        test('400 admin no reason', async () => {
            req.params.id = 'b1';
            req.user = { id: 'admin', role: 'admin' };
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { toString: () => 'test_user_id' } })
            });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Please provide a reason for this change.' }));
        });

        // ทดสอบเคส: Booking นี้ถูกกดยกเลิกไปแล้ว จะมาแก้อีกทำไม
        test('400 status cancelled', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { toString: () => 'test_user_id' }, status: 'cancelled' })
            });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // ทดสอบเคส: จะใช้ฟังก์ชั่นนี้ได้แต่ตัวเองยังจ่ายตังค์ไม่เสร็จ
        test('400 not paid state', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ 
                    user: { toString: () => 'test_user_id' }, 
                    status: 'confirmed', amountPaid: 0, paymentStatus: 'unpaid' 
                })
            });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // ทดสอบเคส: จองเกินจำนวนสิทธิ์ที่ให้ได้
        test('400 invalid nights', async () => {
            req.params.id = 'b1';
            req.body.numberOfNights = 5;
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ 
                    user: { toString: () => 'test_user_id' }, 
                    status: 'confirmed', amountPaid: 1000, paymentStatus: 'paid' 
                })
            });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // ทดสอบเคส: ยิงอัปเดตมาแต่ไม่มีข้อมูลให้เปลี่ยนเลย
        test('400 no updates provided', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ 
                    user: { toString: () => 'test_user_id' }, 
                    status: 'confirmed', amountPaid: 1000, paymentStatus: 'paid' 
                })
            });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // ทดสอบเคสสำเร็จ: เปลี่ยนจำนวนคืนแล้วราคาเพิ่มขึ้น -> ระบบต้องรอการโอนเงินเพื่ม
        test('200 price diff > 0 (additional_payment_required)', async () => {
            req.params.id = 'b1';
            req.body.numberOfNights = 3;
            const mockBooking = { 
                user: { toString: () => 'test_user_id' }, 
                status: 'confirmed', amountPaid: 1000, paymentStatus: 'paid', totalPrice: 1000,
                hotel: { pricePerNight: 500 },
                save: jest.fn()
            };
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockBooking)
            });
            await updatePaidBooking(req, res, next);
            expect(mockBooking.paymentStatus).toBe('pending_additional_payment');
            expect(mockBooking.lastPriceDifference).toBe(500); 
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // ทดสอบเคสสำเร็จ: เปลี่ยนจำนวนคืนลดลงหรือลดจำนวน -> ระบบอนุมัติและรอคืนเงินส่วนต่าง
        test('200 price diff < 0 (refund_issued)', async () => {
            req.params.id = 'b1';
            req.body.checkInDate = '2025-01-01'; 
            req.body.numberOfNights = 1;
            const mockBooking = { 
                user: { toString: () => 'test_user_id' }, 
                status: 'confirmed', amountPaid: 1000, paymentStatus: 'paid', totalPrice: 0,
                numberOfNights: 2, hotel: { pricePerNight: 500 },
                save: jest.fn()
            };
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockBooking)
            });
            await updatePaidBooking(req, res, next);
            expect(mockBooking.paymentStatus).toBe('partial_refund');
            expect(mockBooking.lastPriceDifference).toBe(-500); 
            expect(mockBooking.checkInDate).toBe('2025-01-01');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // ทดสอบเคสสำเร็จ: แอดมินแก้ข้อความหรือรายละเอียดแต่ราคาเท่าเดิม
        test('200 admin update with no price change', async () => {
            req.params.id = 'b1';
            req.user = { id: 'admin_id', role: 'admin' };
            req.body.reason = 'Change request';
            req.body.numberOfNights = 2; 
            const mockBooking = { 
                user: { toString: () => 'test_user_id' }, 
                status: 'confirmed', amountPaid: 1000, paymentStatus: 'paid', totalPrice: 1000,
                numberOfNights: 2, hotel: { pricePerNight: 500 },
                save: jest.fn()
            };
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockBooking)
            });
            await updatePaidBooking(req, res, next);
            expect(mockBooking.paymentStatus).toBe('paid');
            expect(mockBooking.updateReason).toBe('Change request');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // ทดสอบเคส Database ระเบิด (ระบบต้องล้มลงเบาะรองรับ Error 500)
        test('500 server error', async () => {
            req.params.id = 'b1';
            Booking.findById.mockImplementation(() => { throw new Error('DB Error'); });
            await updatePaidBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 2. updateBooking (การแก้ไข Booking ธรรมดา)
    // ==========================================
    describe('updateBooking', () => {
        // ทดสอบเคสหา Booking ไม่เจอ
        test('404 booking not found', async () => {
            req.params.id = 'b1';
            Booking.findById.mockResolvedValue(null);
            await updateBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        // ทดสอบเคสโดนดักเพราะไม่ใช่เจ้าของ
        test('403 unauthorized', async () => {
            req.params.id = 'b1';
            Booking.findById.mockResolvedValue({ user: { toString: () => 'other' } });
            await updateBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        // ทดสอบเคสแอดมินลืมใส่เหตุผล
        test('400 admin no reason', async () => {
            req.params.id = 'b1';
            req.user = { id: 'admin', role: 'admin' };
            Booking.findById.mockResolvedValue({ user: { toString: () => 'test_user_id' } });
            await updateBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // ทดสอบ Policy กฎจำกัดไม่จองเกินเลขคืนลิมิต (เกิน 3 คืนดัก 400)
        test('400 numberOfNights > 3', async () => {
            req.params.id = 'b1';
            req.body.numberOfNights = 4;
            Booking.findById.mockResolvedValue({ user: { toString: () => 'test_user_id' } });
            await updateBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // ทดสอบแอดมินอัปเดตผ่านได้และเซฟเหตุผลได้สำเร็จ
        test('200 success admin update (cover reason setting)', async () => {
            req.params.id = 'b1';
            req.user = { id: 'admin', role: 'admin' };
            req.body.reason = 'Change';
            Booking.findById.mockResolvedValue({ user: { toString: () => 'test_user_id' } });
            Booking.findByIdAndUpdate.mockResolvedValue({ _id: 'b1', updateReason: 'Change' });
            await updateBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 server error', async () => {
            req.params.id = 'b1';
            Booking.findById.mockImplementation(() => { throw new Error('DB'); });
            await updateBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 3. deleteBooking (การยกเลิกการจอง)
    // ==========================================
    describe('deleteBooking', () => {
        // หาไม่เจอ = 404
        test('404 booking not found', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
            await deleteBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        // ไม่ใช่เจ้าของ = 403
        test('403 unauthorized', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { toString: () => 'other' } })
            });
            await deleteBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        // เคสยกเลิกซ้ำซ้อน (โดน CancelPolicy ตีกลับเป็นฟอลส์พร้อม 400)
        test('400 applyCancellationPolicy fails (already cancelled)', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { toString: () => 'test_user_id' }, status: 'cancelled' })
            });
            await deleteBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // แอดมินมาลบแต่ไม่มีข้อมูลเหตุผล = 400 
        test('400 admin delete no reason', async () => {
            req.params.id = 'b1';
            req.user = { id: 'admin_id', role: 'admin' };
            Booking.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { toString: () => 'test_user_id' }, status: 'confirmed' })
            });
            await deleteBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        // *** หัวใจสำคัญของ Policy: ยกเลิกก่อนล่วงหน้านานๆ (>72 ช.ม.) ระบบต้องคืนเงินเต็ม 100% ***
        test('200 success 100% refund ( >= 72h ) - owner role', async () => {
            req.params.id = 'b1';
            req.user = { id: 'owner_id', role: 'owner' };
            req.body.reason = "some reason";
            const checkInDate = new Date(Date.now() + 96 * 60 * 60 * 1000); // จำลองว่าอีก 96 ช.ม. ถึงจะดึงเช็คอิน
            const mockBooking = { user: { toString: () => 'owner_id' }, status: 'confirmed', checkInDate, amountPaid: 1000, totalPrice: 1000, paymentStatus: 'paid', save: jest.fn().mockResolvedValue(true) };
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockBooking) });
            await deleteBooking(req, res, next);
            expect(mockBooking.refundRate).toBe(1); // เช็คว่าคืน 100%
            expect(mockBooking.paymentStatus).toBe('refunded'); // เช็คขึ้นสถานะว่าโอนคืนแล้ว
            expect(mockBooking.cancelledBy).toBe('owner');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // *** หัวใจสำคัญของ Policy: ยกเลิกระยะกลางๆ (24 - 71 ช.ม.) ระบบหักครึ่งราคา คืนให้แค่ 50% ***
        test('200 success 50% refund ( 24h - 71h )', async () => {
            req.params.id = 'b1';
            req.body.reason = "some reason";
            const checkInDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 ชั่วโมงข้างหน้า
            const mockBooking = { user: { toString: () => 'test_user_id' }, status: 'confirmed', checkInDate, amountPaid: 1000, totalPrice: 1000, paymentStatus: 'paid', save: jest.fn().mockResolvedValue(true) };
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockBooking) });
            await deleteBooking(req, res, next);
            expect(mockBooking.refundRate).toBe(0.5); // เช็คว่าคืนแค่ 50%
            expect(mockBooking.paymentStatus).toBe('partial_refund');
            expect(mockBooking.cancelledBy).toBe('user');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        // *** หัวใจสำคัญของ Policy: ยกเลิกกระชั้นชิด (< 24 ช.ม.) ให้อภัยไม่ได้ ระบบยึดเงิน 0% ทันที ***
        test('200 success 0% refund ( < 24h ) with unpaid status', async () => {
            req.params.id = 'b1';
            req.body.reason = "some reason";
            const checkInDate = new Date(Date.now() + 10 * 60 * 60 * 1000); // แค่ 10 ชั่วโมงก็จะเตรียมเข้าพักแล้ว
            const mockBooking = { user: { toString: () => 'test_user_id' }, status: 'confirmed', checkInDate, amountPaid: 0, totalPrice: 1000, paymentStatus: 'unpaid', save: jest.fn().mockResolvedValue(true) };
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockBooking) });
            await deleteBooking(req, res, next);
            expect(mockBooking.refundRate).toBe(0); // เช็คว่าไม่ได้สักสตางค์
            expect(mockBooking.refundAmount).toBe(0);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 server error', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({ populate: jest.fn().mockRejectedValue(new Error('DB')) });
            await deleteBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 4. getBookings (ดึงข้อมูลการจองทั้งหมด)
    // ==========================================
    describe('getBookings', () => {
        test('200 success get own bookings (User)', async () => {
            const mockQuery = { populate: jest.fn().mockResolvedValue(['b1']) };
            Booking.find.mockReturnValue(mockQuery);
            await getBookings(req, res, next);
            expect(Booking.find).toHaveBeenCalledWith({ user: 'test_user_id' });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('200 success get all bookings (Admin)', async () => {
            req.user = { id: 'admin', role: 'admin' };
            const mockQuery = { populate: jest.fn().mockResolvedValue(['b1', 'b2']) };
            Booking.find.mockReturnValue(mockQuery);
            await getBookings(req, res, next);
            expect(Booking.find).toHaveBeenCalledWith();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('200 success get hotel bookings (Admin)', async () => {
            req.user = { id: 'admin', role: 'admin' };
            req.params.hotelId = 'h1';
            const mockQuery = { populate: jest.fn().mockResolvedValue(['b1']) };
            Booking.find.mockReturnValue(mockQuery);
            await getBookings(req, res, next);
            expect(Booking.find).toHaveBeenCalledWith({ hotel: 'h1' });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 server error', async () => {
            const mockQuery = { populate: jest.fn().mockRejectedValue(new Error('DB Error')) };
            Booking.find.mockReturnValue(mockQuery);
            await getBookings(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 5. getBooking (ดึงข้อมูลการจองเดียว)
    // ==========================================
    describe('getBooking', () => {
        test('404 not found', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
            await getBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('403 unauthorized', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ user: { toString: () => 'other' } }) });
            await getBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('200 success', async () => {
            req.params.id = 'b1';
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ user: { toString: () => 'test_user_id' } }) });
            await getBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 server error', async () => {
            req.params.id = 'b1';
            Booking.findById.mockImplementation(() => { throw new Error('DB Error'); });
            await getBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 6. addBooking (เพิ่มการจองใหม่)
    // ==========================================
    describe('addBooking', () => {
        test('404 hotel not found', async () => {
            req.params.hotelId = 'h1';
            Hotel.findById.mockResolvedValue(null);
            await addBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('400 nights > 3', async () => {
            req.params.hotelId = 'h1';
            Hotel.findById.mockResolvedValue({ _id: 'h1' });
            req.body.numberOfNights = 4;
            await addBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 invalid room type format', async () => {
            req.params.hotelId = 'h1';
            Hotel.findById.mockResolvedValue({ _id: 'h1' });
            req.body.numberOfNights = 2;
            req.body.roomType = 'invalid';
            await addBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid room type') }));
        });

        test('400 hotel does not have room type', async () => {
            req.params.hotelId = 'h1';
            Hotel.findById.mockResolvedValue({ _id: 'h1', roomTypes: [{ id: 'suite' }] });
            req.body.numberOfNights = 2;
            req.body.roomType = 'standard';
            await addBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('201 success using hotel roomTypes price', async () => {
            req.params.hotelId = 'h1';
            Hotel.findById.mockResolvedValue({ _id: 'h1', roomTypes: [{ id: 'standard', pricePerNight: 1000 }] });
            req.body.numberOfNights = 2;
            req.body.roomType = 'standard';
            Booking.create.mockResolvedValue({ _id: 'b1' });
            await addBooking(req, res, next);
            expect(req.body.totalPrice).toBe(2000);
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('201 success using hotel pricePerNight fallback', async () => {
            req.params.hotelId = 'h1';
            Hotel.findById.mockResolvedValue({ _id: 'h1', pricePerNight: 500 });
            req.body.numberOfNights = 2;
            Booking.create.mockResolvedValue({ _id: 'b1' });
            await addBooking(req, res, next);
            expect(req.body.totalPrice).toBe(1000);
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('400 no rooms available on selected dates', async () => {
            req.params.hotelId = 'h1';
            req.body.checkInDate = '2026-05-01';
            req.body.numberOfNights = 2;
            req.body.roomType = 'deluxe';
            Hotel.findById.mockResolvedValue({ 
                _id: 'h1', 
                roomTypes: [{ id: 'deluxe', pricePerNight: 2000, totalRooms: 5 }] 
            });
            Booking.countDocuments.mockResolvedValue(5); // จำลองว่าห้องเต็มแล้วทั้ง 5 ห้อง
            await addBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'No rooms available on the selected dates.' }));
        });

        test('201 success when rooms are available with totalRooms check', async () => {
            req.params.hotelId = 'h1';
            req.body.checkInDate = '2026-05-01';
            req.body.numberOfNights = 2;
            req.body.roomType = 'deluxe';
            Hotel.findById.mockResolvedValue({ 
                _id: 'h1', 
                roomTypes: [{ id: 'deluxe', pricePerNight: 2000, totalRooms: 5 }] 
            });
            Booking.countDocuments.mockResolvedValue(2); // จำลองว่าจองไป 2 ห้อง (ยังว่าง)
            Booking.create.mockResolvedValue({ _id: 'b2' });
            await addBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('500 error', async () => {
            Hotel.findById.mockRejectedValue(new Error('DB'));
            await addBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 7. cancelBooking (เลิกการจองก่อนจ่าย)
    // ==========================================
    describe('cancelBooking', () => {
        test('404 booking not found', async () => {
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
            await cancelBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('403 unauthorized', async () => {
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ user: { toString: () => 'other' } }) });
            await cancelBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('400 cancellation policy fails', async () => {
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ user: { toString: () => 'test_user_id' }, status: 'cancelled' }) });
            await cancelBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('200 success cancel', async () => {
            const mockBooking = { user: { toString: () => 'test_user_id' }, status: 'confirmed', checkInDate: new Date(Date.now() + 48 * 3600000), paymentStatus: 'unpaid', save: jest.fn() };
            Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockBooking) });
            await cancelBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 error', async () => {
            Booking.findById.mockReturnValue({ populate: jest.fn().mockRejectedValue(new Error('DB')) });
            await cancelBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 8. createBookingRequest (ส่งคำขอการแก้ไขการจอง)
    // ==========================================
    describe('createBookingRequest', () => {
        test('404 not found', async () => {
            Booking.findById.mockResolvedValue(null);
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('403 not owner', async () => {
            Booking.findById.mockResolvedValue({ user: { toString: () => 'other' } });
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('400 already cancelled', async () => {
            Booking.findById.mockResolvedValue({ user: { toString: () => 'test_user_id' }, status: 'cancelled' });
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 invalid type', async () => {
            Booking.findById.mockResolvedValue({ user: { toString: () => 'test_user_id' } });
            req.body.type = 'invalid';
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 edit missing fields', async () => {
            Booking.findById.mockResolvedValue({ user: { toString: () => 'test_user_id' } });
            req.body.type = 'edit';
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 edit invalid nights', async () => {
            Booking.findById.mockResolvedValue({ user: { toString: () => 'test_user_id' } });
            req.body = { type: 'edit', newNumberOfNights: 4 };
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 already pending request exists', async () => {
            Booking.findById.mockResolvedValue({ _id: 'b1', user: { toString: () => 'test_user_id' } });
            req.body = { type: 'edit', newNumberOfNights: 2 };
            BookingRequest.findOne.mockResolvedValue({ _id: 'req1' });
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('201 success edit request', async () => {
            const mockBooking = { _id: 'b1', user: { toString: () => 'test_user_id' }, status: 'confirmed', save: jest.fn() };
            Booking.findById.mockResolvedValue(mockBooking);
            req.body = { type: 'edit', newNumberOfNights: 2 };
            BookingRequest.findOne.mockResolvedValue(null);
            BookingRequest.create.mockResolvedValue({});
            await createBookingRequest(req, res, next);
            expect(mockBooking.status).toBe('pending');
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('500 server error', async () => {
            Booking.findById.mockRejectedValue(new Error('DB'));
            await createBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 9. getMyBookingRequests
    // ==========================================
    describe('getMyBookingRequests', () => {
        test('200 success', async () => {
            BookingRequest.find.mockReturnValue({ populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(['r1']) }) });
            await getMyBookingRequests(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 error', async () => {
            BookingRequest.find.mockImplementation(() => { throw new Error('DB'); });
            await getMyBookingRequests(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 10. getBookingRequests (Admin)
    // ==========================================
    describe('getBookingRequests', () => {
        test('200 success filtered status', async () => {
            req.query = { status: 'pending' };
            BookingRequest.find.mockReturnValue({ populate: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(['r1']) }) }) });
            await getBookingRequests(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 error', async () => {
            BookingRequest.find.mockImplementation(() => { throw new Error('DB'); });
            await getBookingRequests(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 11. respondToBookingRequest (Admin)
    // ==========================================
    describe('respondToBookingRequest', () => {
        test('403 unauthorized', async () => {
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('404 request not found', async () => {
            req.user = { role: 'admin' };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('400 not pending', async () => {
            req.user = { role: 'admin' };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ status: 'approved' }) });
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 no reason provided', async () => {
            req.user = { role: 'admin' };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ status: 'pending' }) });
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 invalid action', async () => {
            req.user = { role: 'admin' };
            req.body = { reason: 'ok', action: 'hello' };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ status: 'pending' }) });
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('404 target booking missing on approve', async () => {
            req.user = { role: 'admin' };
            req.body = { reason: 'ok', action: 'approve' };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ status: 'pending', booking: { _id: 'b1' } }) });
            Booking.findById.mockResolvedValue(null);
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('200 success approve edit', async () => {
            req.user = { role: 'admin' };
            req.body = { reason: 'ok', action: 'approve' };
            const mReq = { status: 'pending', type: 'edit', newCheckInDate: '2025-01-01', newNumberOfNights: 2, booking: { _id: 'b1' }, save: jest.fn() };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mReq) });
            const mockBooking = { _id: 'b1', save: jest.fn() };
            Booking.findById.mockResolvedValue(mockBooking);
            await respondToBookingRequest(req, res, next);
            expect(mockBooking.status).toBe('confirmed');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('200 success approve delete', async () => {
            req.user = { id: 'a1', role: 'admin' };
            req.body = { reason: 'ok', action: 'approve' };
            const mReq = { status: 'pending', type: 'delete', booking: { _id: 'b1' }, save: jest.fn() };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mReq) });
            const mockBooking = { _id: 'b1', paymentStatus: 'unpaid', save: jest.fn() };
            Booking.findById.mockResolvedValue(mockBooking);
            await respondToBookingRequest(req, res, next);
            expect(mockBooking.status).toBe('cancelled');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('400 fail approve delete if already cancelled', async () => {
            req.user = { id: 'a1', role: 'admin' };
            req.body = { reason: 'ok', action: 'approve' };
            const mReq = { status: 'pending', type: 'delete', booking: { _id: 'b1' }, save: jest.fn() };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mReq) });
            
            // set booking status to 'cancelled' so applyCancellationPolicy returns success: false
            const mockBooking = { _id: 'b1', status: 'cancelled', paymentStatus: 'unpaid', save: jest.fn() };
            Booking.findById.mockResolvedValue(mockBooking);
            
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(400); // 400 is the code from applyCancellationPolicy
        });

        test('200 success reject and restore booking', async () => {
            req.user = { role: 'admin' };
            req.body = { reason: 'nope', action: 'reject' };
            const mReq = { status: 'pending', booking: { _id: 'b1' }, save: jest.fn() };
            BookingRequest.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mReq) });
            const mockBooking = { _id: 'b1', status: 'pending', save: jest.fn() };
            Booking.findById.mockResolvedValue(mockBooking);
            await respondToBookingRequest(req, res, next);
            expect(mockBooking.status).toBe('confirmed');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 server error', async () => {
            req.user = { role: 'admin' };
            BookingRequest.findById.mockImplementation(() => { throw new Error('DB Error'); });
            await respondToBookingRequest(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ==========================================
    // ฟังก์ชันที่ 12. mockPayBooking
    // ==========================================
    describe('mockPayBooking', () => {
        beforeEach(() => {
            req.user = { id: 'test_user_id', role: 'user' };
        });

        test('404 booking not found', async () => {
            Booking.findById.mockResolvedValue(null);
            await mockPayBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('403 unauthorized', async () => {
            Booking.findById.mockResolvedValue({ user: { toString: () => 'other' } });
            await mockPayBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('200 success payment mock', async () => {
            const mockBooking = { user: { toString: () => 'test_user_id' }, save: jest.fn() };
            Booking.findById.mockResolvedValue(mockBooking);
            
            // รอให้ delay ทำงานเสร็จ
            await mockPayBooking(req, res, next);
            
            expect(mockBooking.paymentStatus).toBe('paid');
            expect(mockBooking.status).toBe('confirmed');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('500 error', async () => {
            Booking.findById.mockRejectedValue(new Error('DB'));
            await mockPayBooking(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
