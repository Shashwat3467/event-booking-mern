const dotenv = require("dotenv");

dotenv.config();

const senderEmail = process.env.BREVO_FROM_EMAIL;
const senderName = process.env.BREVO_FROM_NAME;
const apiKey = process.env.BREVO_API_KEY;

const sendEmail = async (to, subject, html) => {
    try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify({
                sender: {
                    email: senderEmail,
                    name: senderName,
                },
                to: [
                    {
                        email: to,
                    },
                ],
                subject,
                htmlContent: html,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }

        console.log("Email sent successfully");
    } catch (err) {
        console.error("Brevo API Error:", err.message);
    }
};

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    await sendEmail(
        userEmail,
        `Booking Confirmed: ${eventTitle}`,
        `
        <h2>Hi ${userName}!</h2>
        <p>Your booking for <strong>${eventTitle}</strong> has been confirmed.</p>
        <p>Thank you for choosing EvEnter.</p>
        `
    );
};

const sendOTPEmail = async (userEmail, otp, type) => {

    const title =
        type === "account_verification"
            ? "Verify your EvEnter Account"
            : "EvEnter Booking Verification";

    const msg =
        type === "account_verification"
            ? "Please use the OTP below to verify your account."
            : "Please use the OTP below to verify your booking.";

    await sendEmail(
        userEmail,
        title,
        `
        <div style="font-family: Arial; text-align:center;">
            <h2>${title}</h2>
            <p>${msg}</p>

            <h1 style="letter-spacing:5px;">
                ${otp}
            </h1>

            <p>This OTP expires in 5 minutes.</p>
        </div>
        `
    );
};

module.exports = {
    sendBookingEmail,
    sendOTPEmail,
};