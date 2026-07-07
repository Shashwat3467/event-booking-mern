const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const senderEmail = process.env.BREVO_FROM_EMAIL || process.env.EMAIL_USER || 'no-reply@eventer.com';

console.log({
  host: process.env.BREVO_SMTP_HOST,
  port: process.env.BREVO_SMTP_PORT,
  secure: process.env.BREVO_SMTP_SECURE,
  user: process.env.BREVO_SMTP_USER,
  from: process.env.BREVO_FROM_EMAIL,
  passExists: !!process.env.BREVO_SMTP_PASS,
});

const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMTP_PORT) || 587,
    secure: process.env.BREVO_SMTP_SECURE === 'true',
    auth: {
        user: process.env.BREVO_SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.BREVO_SMTP_PASS || process.env.EMAIL_PASS,
    },
});

transporter.verify((err) => {
    if (err) {
        console.error('Brevo SMTP Verify Error:', err);
    } else {
        console.log('Brevo SMTP Ready');
    }
});

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    try {
        const mailOptions = {
            from: senderEmail,
            to: userEmail,
            subject: `Booking Confirmed: ${eventTitle}`,
            html: `
        <h2>Hi ${userName}!</h2>
        <p>Your booking for the event <strong>${eventTitle}</strong> is successfully confirmed.</p>
        <p>Thank you for choosing EvEnter.</p>
      `
        };
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to', userEmail);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

const sendOTPEmail = async (userEmail, otp, type) => {
    try {
        const title = type === 'account_verification' ? 'Verify your EvEnter Account' : 'EvEnter Booking Verification';
        const msg = type === 'account_verification'
            ? 'Please use the following OTP to verify your new EvEnter account.'
            : 'Please use the following OTP to verify and confirm your event booking.';

        const mailOptions = {
            from: senderEmail,
            to: userEmail,
            subject: title,
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #111;">${title}</h2>
                    <p style="color: #555; font-size: 16px;">${msg}</p>
                    <div style="margin: 20px auto; padding: 15px; font-size: 24px; font-weight: bold; background: #f4f4f4; width: max-content; letter-spacing: 5px;">
                        ${otp}
                    </div>
                    <p style="color: #999; font-size: 12px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${userEmail} for ${type}`);
    } catch (error) {
        console.error('Error sending OTP email:', error);
    }
};

module.exports = { sendBookingEmail, sendOTPEmail };