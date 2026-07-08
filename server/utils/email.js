const brevo = require("@getbrevo/brevo");
const dotenv = require("dotenv");

dotenv.config();

const senderEmail =
    process.env.BREVO_FROM_EMAIL || "no-reply@eventer.com";

const senderName =
    process.env.BREVO_FROM_NAME || "EvEnter";

const apiInstance = new brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
);

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    try {
        await apiInstance.sendTransacEmail({
            sender: {
                email: senderEmail,
                name: senderName,
            },
            to: [
                {
                    email: userEmail,
                    name: userName,
                },
            ],
            subject: `Booking Confirmed: ${eventTitle}`,
            htmlContent: `
                <h2>Hi ${userName}!</h2>
                <p>Your booking for the event <strong>${eventTitle}</strong> is successfully confirmed.</p>
                <p>Thank you for choosing EvEnter.</p>
            `,
        });

        console.log("Booking email sent successfully");
    } catch (error) {
        console.error(
            "Booking Email Error:",
            error.response?.body || error.message
        );
    }
};

const sendOTPEmail = async (userEmail, otp, type) => {
    try {
        const title =
            type === "account_verification"
                ? "Verify your EvEnter Account"
                : "EvEnter Booking Verification";

        const msg =
            type === "account_verification"
                ? "Please use the following OTP to verify your new EvEnter account."
                : "Please use the following OTP to verify and confirm your event booking.";

        await apiInstance.sendTransacEmail({
            sender: {
                email: senderEmail,
                name: senderName,
            },
            to: [
                {
                    email: userEmail,
                },
            ],
            subject: title,
            htmlContent: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #111;">${title}</h2>
                    <p style="color: #555; font-size: 16px;">${msg}</p>
                    <div style="margin: 20px auto; padding: 15px; font-size: 24px; font-weight: bold; background: #f4f4f4; width: max-content; letter-spacing: 5px;">
                        ${otp}
                    </div>
                    <p style="color: #999; font-size: 12px;">
                            This code expires in 5 minutes.
                    </p>
                </div>
            `,
        });

        console.log(`OTP sent to ${userEmail}`);
    } catch (error) {
        console.error(
            "OTP Email Error:",
            error.response?.body || error.message
        );
    }
};

module.exports = {
    sendBookingEmail,
    sendOTPEmail,
};