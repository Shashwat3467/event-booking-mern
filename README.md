# EvEnter - MERN Event Booking

Discover events, verify an account by email, request a booking, and manage bookings through user and admin dashboards. Admins create events, confirm requests, record payment status manually, and cancel bookings. Payment status is a manual record; there is no payment gateway integration.

## Requirements

- Node.js 22.12+ (or a newer supported LTS release) and npm.
- MongoDB Atlas, or a local MongoDB replica set. Booking creation, confirmation, cancellation, and capacity changes use multi-document transactions. A standalone MongoDB server does not support these operations.
- A Brevo API key and a verified Brevo sender for OTP and confirmation emails.

## Local setup

From the repository root:

```powershell
npm install
npm run setup
Copy-Item server/.env.example server/.env
Copy-Item client/EVENTER/.env.example client/EVENTER/.env
```

Edit `server/.env` with your MongoDB connection string, a long random `JWT_SECRET`, and `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, and `BREVO_FROM_NAME`. Do not commit `.env` files or credentials. The example files contain placeholders only. The application uses Brevo's HTTP API, not SMTP email/password settings.

For local MongoDB, start a replica set (for example, `mongod --replSet rs0 --dbpath <your-data-folder>`) and run `rs.initiate()` once in `mongosh`. Use `mongodb://127.0.0.1:27017/eventer?replicaSet=rs0` as the connection string. Atlas already supports transactions.

```powershell
npm run dev
```

Open the Vite URL printed in the terminal (normally http://localhost:5173). The backend defaults to the port in `server/.env` (example: 3000). `VITE_API_URL` must point to that backend's `/api` path.

Register an account, enter the emailed code, then request an event booking. If registration creates the account but email delivery fails, sign in with the same credentials to request another code.

## Booking and OTP behavior

- Requests are pending until an admin confirms them. Pending requests do not deduct seats.
- Confirmation atomically deducts one available seat and changes booking status. If either write fails, both roll back. Cancellation restores a seat only for a confirmed booking, once.
- Concurrent booking requests for the same user are serialized through a user-document write inside the transaction, preventing duplicate active bookings without adding an index that could fail on existing historical duplicates.
- Capacity edits preserve seats already used by confirmed bookings and reject reductions below that count.
- Codes are cryptographically random, stored as keyed hashes, valid for five minutes, and usable once. Five attempts are allowed per code, with a 60-second resend cooldown. Database TTL cleanup is not relied on to enforce expiry.
- Account authentication and booking OTP endpoints also limit requests by IP: 30 requests per 15 minutes for each route group. IP counters are per server process; multiple application instances should use a shared gateway limiter. Account cooldown and attempt limits are shared through MongoDB.
- OTP email failures return 502. A committed booking remains successful if its notification email fails; the response contains `emailSent: false`, and the admin dashboard displays the warning.
- Existing accounts/events/bookings are retained. OTPs issued before the hash-format upgrade must be requested again. Historical seat-count inconsistencies or duplicate bookings are not rewritten automatically.

## Checks

```powershell
npm test --prefix server
npm run build --prefix client/EVENTER
```

The default test command runs status-code and OTP regression tests. Database concurrency tests are skipped unless `TEST_MONGO_URL` is explicitly set. To run them against a dedicated test replica set or Atlas test cluster:

```powershell
$env:TEST_MONGO_URL = 'mongodb://127.0.0.1:27017/?replicaSet=rs0'
npm test --prefix server
Remove-Item Env:TEST_MONGO_URL
```

These tests create and drop a uniquely named `eventer_test_*` database. They do not use `MONGO_URL` or the application database. The database user needs permission to create and drop that test database. Do not point test commands at production infrastructure.

ESLint has been removed as requested. JavaScript parsing/build checks and backend tests remain available.

## Demo data and administration

`server/seed.js` creates sample users, events, and bookings. It deletes existing users, events, and bookings first. Run it only against a disposable development database:

```powershell
Set-Location server
node seed.js
```

Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before seeding. The script also creates demo users with known sample passwords. Avoid using seed data for a public deployment.

## Existing GitHub repository

This checkout remains connected to the existing GitHub repository. Review local changes before committing:

```powershell
git status
git diff
```

After review and passing checks, commit the intended files and push to your usual branch (or create a feature branch and pull request). No commit or push is performed by the application setup. Keep secrets and generated `node_modules`/`dist` files out of Git.

## Deployment

Build the frontend with `npm run build --prefix client/EVENTER`; serve `client/EVENTER/dist` with SPA fallback routing. Set `VITE_API_URL` at build time if the API uses a different origin, or proxy `/api` to the backend. Start the backend with `npm start --prefix server`, configure server environment variables, and use a MongoDB deployment that supports transactions.
