/**
 * Feature Flags — toggle entire subsystems without touching business logic.
 *
 * To re-enable everything:
 *   OTP_ENABLED  → true
 *   EMAIL_ENABLED → true
 *
 * When OTP_ENABLED = false:
 *   - Hotel registration: account created immediately, no OTP step
 *   - Forgot password:    fixed dev OTP "000000" stored (no email sent)
 *
 * When EMAIL_ENABLED = false:
 *   - All send* functions return success without contacting Gmail SMTP
 *   - Alert dispatch skips email + WhatsApp and marks status SKIPPED
 */

export const FEATURES = {
  /** Require email OTP for hotel registration and password reset */
  OTP_ENABLED: false,

  /** Send real emails via Gmail SMTP (OTP, welcome, reset, alerts) */
  EMAIL_ENABLED: false,
};

/** Fixed dev OTP used when OTP_ENABLED = false — never use in production */
export const DEV_OTP = '000000';
