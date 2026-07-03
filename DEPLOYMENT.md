# Deployment Guide

This project is now prepared for deployment as a single Node app.

## Recommended host: Render

1. Push this repository to GitHub.
2. Create a new Web Service on Render.
3. Connect the GitHub repository.
4. Use these settings:
   - Build Command: npm run build
   - Start Command: npm run start
5. Add the following environment variables:
   - NODE_ENV=production
   - PORT=10000
   - MONGO_URL=your_mongodb_atlas_connection_string
   - JWT_SECRET=your_long_random_secret
   - EMAIL_USER=your_email@gmail.com
   - EMAIL_PASS=your_email_app_password
6. Deploy.

## Notes

- The backend serves the built frontend from the client app in production.
- The frontend uses /api as the API base URL, so it works on the same domain.
- Keep your .env values private. They should be set in the hosting provider, not committed to Git.
