const jwt = require('jsonwebtoken');
const User = require('../../../models/User');
const { protect, authorize } = require('../../../middleware/auth');

jest.mock('jsonwebtoken');
jest.mock('../../../models/User');

describe('Auth Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            headers: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        
        // Suppress console.error for clean test output
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
        console.error.mockRestore();
    });

    describe('protect', () => {
        test('should return 401 if no authorization header is present', async () => {
            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Not authorized to access this route - Please login'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should return 401 if authorization header does not start with Bearer', async () => {
            req.headers.authorization = 'Basic token123';

            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        test('should return 401 if token is the string "null"', async () => {
            req.headers.authorization = 'Bearer null';

            await protect(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        test('should return 401 if token verification fails', async () => {
            req.headers.authorization = 'Bearer invalid_token';
            process.env.JWT_SECRET = 'secret';

            jwt.verify.mockImplementation(() => {
                throw new Error('invalid signature');
            });

            await protect(req, res, next);

            expect(jwt.verify).toHaveBeenCalledWith('invalid_token', 'secret');
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Not authorized to access this route - Invalid token'
            });
            expect(console.error).toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });

        test('should return 401 if user is not found', async () => {
            req.headers.authorization = 'Bearer valid_token';
            process.env.JWT_SECRET = 'secret';

            jwt.verify.mockReturnValue({ id: 'user_id' });
            User.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue(null)
            });

            await protect(req, res, next);

            expect(User.findById).toHaveBeenCalledWith('user_id');
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'User not found - Token invalid'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should call next() and attach user to req if token is valid and user exists', async () => {
            req.headers.authorization = 'Bearer valid_token';
            process.env.JWT_SECRET = 'secret';

            const mockUser = { _id: 'user_id', name: 'Test User' };
            jwt.verify.mockReturnValue({ id: 'user_id' });
            User.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue(mockUser)
            });

            await protect(req, res, next);

            expect(req.user).toEqual(mockUser);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe('authorize', () => {
        test('should return 403 if user role is not authorized', () => {
            req.user = { role: 'user' };
            const middleware = authorize('admin', 'owner');

            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: "User role 'user' is not authorized to access this route"
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should call next() if user role is authorized', () => {
            req.user = { role: 'admin' };
            const middleware = authorize('admin', 'owner');

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });
});
