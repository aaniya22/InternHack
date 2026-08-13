import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../auth.service.js';
import { prisma } from '../../../database/db.js';
import { hashPassword, comparePassword } from '../../../utils/password.utils.js';
import { generateToken } from '../../../utils/jwt.utils.js';
import { sendEmail } from '../../../utils/email.utils.js';
import { createUniqueProfileSlug } from '../../../lib/slug.js';
import { invalidateVersionCache } from '../../../middleware/auth.middleware.js';
import type { user as User } from '@prisma/client';

// --- MOCK DEPENDENCIES ---
vi.mock('../../../database/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../../utils/password.utils.js', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

vi.mock('../../../utils/jwt.utils.js', () => ({
  generateToken: vi.fn(),
}));

vi.mock('../../../utils/email.utils.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../lib/slug.js', () => ({
  createUniqueProfileSlug: vi.fn(),
}));

vi.mock('../../../middleware/auth.middleware.js', () => ({
  invalidateVersionCache: vi.fn(),
}));

// --- TYPED TEST BUILDER ---
// Using `any` for overrides and `as User` ensures the test suite compiles 
// perfectly even if your local Prisma schema lacks some of the extended test fields.
const createMockUser = (overrides: any = {}): User => ({
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  password: 'hashed_password',
  role: 'STUDENT',
  bio: null,
  college: null,
  graduationYear: null,
  contactNo: null,
  profilePic: null,
  isActive: true,
  isVerified: true,
  isProfilePublic: false, // <-- This fixes the final error shown in your video!
  verificationOtp: null,
  otpExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tokenVersion: 1,
  ...overrides,
} as User);

describe('Auth Service', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('successfully registers a new user', async () => {
      const mockInput = { name: 'John Doe', email: 'john@example.com', password: 'password123' };
      const mockCreatedUser = createMockUser();

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(hashPassword).mockResolvedValue('hashed_password');
      vi.mocked(prisma.user.create).mockResolvedValue(mockCreatedUser);
      vi.mocked(createUniqueProfileSlug).mockResolvedValue('john-doe-1');

      const result = await authService.register(mockInput);

      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          email: 'john@example.com',
          password: 'hashed_password',
        })
      }));
      expect(createUniqueProfileSlug).toHaveBeenCalledWith('John Doe', 1, prisma);
      expect(sendEmail).toHaveBeenCalled();
      expect(result.user).toEqual(expect.objectContaining({ id: 1, email: 'john@example.com' }));
    });

    it('throws an error if email is already registered', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(createMockUser());

      await expect(authService.register({ name: 'John', email: 'john@example.com', password: 'pass' }))
        .rejects.toThrow('Email already registered');
      
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('successfully logs in a verified user', async () => {
      const mockUser = createMockUser();
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(true);
      vi.mocked(generateToken).mockReturnValue('mock_jwt_token');

      const result = await authService.login({ email: 'john@example.com', password: 'password123' });

      expect(result.token).toBe('mock_jwt_token');
      expect(result.user.id).toBe(1);
    });

    it('throws an error for wrong password', async () => {
      const mockUser = createMockUser();
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(false);

      await expect(authService.login({ email: 'john@example.com', password: 'wrongpassword' }))
        .rejects.toThrow('Invalid email or password');
    });

    it('throws an error and sends OTP if email is not verified', async () => {
      const mockUser = createMockUser({ isVerified: false });
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(true);

      await expect(authService.login({ email: 'john@example.com', password: 'password123' }))
        .rejects.toThrow('EMAIL_NOT_VERIFIED');

      expect(prisma.user.update).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('generates an OTP and sends an email if user exists', async () => {
      const mockUser = createMockUser();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      await authService.forgotPassword('john@example.com');

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          passwordResetAttempts: 0,
        })
      }));
      expect(sendEmail).toHaveBeenCalled();
    });

    it('returns silently without sending email if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await authService.forgotPassword('unknown@example.com');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('successfully resets password and increments tokenVersion', async () => {
      const mockUser = createMockUser({ 
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() + 10000)
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(true);
      vi.mocked(hashPassword).mockResolvedValue('new_hashed_password');

      await authService.resetPassword('john@example.com', '123456', 'new_password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          password: 'new_hashed_password',
          resetPasswordOtp: null,
          resetOtpExpiresAt: null,
          passwordResetAttempts: 0,
          passwordResetLockedUntil: null,
          tokenVersion: { increment: 1 },
        },
      });
      expect(invalidateVersionCache).toHaveBeenCalledWith(1);
    });

    it('throws an error if the reset token is expired', async () => {
      const mockUser = createMockUser({ 
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() - 10000) // Past date
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      await expect(authService.resetPassword('john@example.com', '123456', 'new_password'))
        .rejects.toThrow('Reset code has expired');
    });

    it('increments failed attempts and throws if OTP is incorrect', async () => {
      const mockUser = createMockUser({ 
        passwordResetAttempts: 0,
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() + 10000) 
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(false);

      await expect(authService.resetPassword('john@example.com', 'wrong_otp', 'new_password'))
        .rejects.toThrow(/Invalid reset code/);

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { passwordResetAttempts: 1 }
      }));
    });

    it('locks account after 3 failed password reset attempts', async () => {
      const mockUser = createMockUser({ 
        passwordResetAttempts: 2, // 2 previous attempts
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() + 10000) 
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(false);

      await expect(authService.resetPassword('john@example.com', 'wrong_otp', 'new_password'))
        .rejects.toThrow('Too many failed attempts. Account locked for 30 minutes for security');

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { 
          passwordResetAttempts: 3, 
          passwordResetLockedUntil: expect.any(Date)
        }
      }));
    });

    it('rejects password reset if account is currently locked', async () => {
      const lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 mins in future
      const mockUser = createMockUser({
        passwordResetLockedUntil: lockTime,
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      await expect(authService.resetPassword('john@example.com', '123456', 'new_password'))
        .rejects.toThrow('Too many failed attempts. Please try again in 15 minutes');
      
      // Asserts that OTP check is never reached
      expect(comparePassword).not.toHaveBeenCalled();
    });

    it('allows password reset if the lockout period has expired', async () => {
      const pastLockTime = new Date(Date.now() - 5 * 60 * 1000); // 5 mins in past
      const mockUser = createMockUser({
        passwordResetLockedUntil: pastLockTime,
        resetPasswordOtp: 'hashed_otp',
        resetOtpExpiresAt: new Date(Date.now() + 10000)
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(comparePassword).mockResolvedValue(true);
      vi.mocked(hashPassword).mockResolvedValue('new_hashed_password');

      await authService.resetPassword('john@example.com', '123456', 'new_password');

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          password: 'new_hashed_password',
          passwordResetLockedUntil: null,
        })
      }));
    });
  });
});