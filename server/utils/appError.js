module.exports = (status, message, retryAfter) => Object.assign(new Error(message), { status, retryAfter });
