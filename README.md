# Lasting Tribute Company - MVP App (Phase 2)

A working web app for Julie Brown's **Lasting Tribute Company**.

## Included Features

- Business branding and contact details
- Funeral home **account signup/login**
- Order intake form for logged-in funeral homes
- Tribute package details:
  - 4-minute personalized song + video
  - Flat rate: **$299.00**
- Photo upload with a **40 photo max**
- Loved one highlights, names/nicknames fields
- Partner discount request field for repeat funeral homes
- PayPal payment link to `rangerbleau11@gmail.com`
- Admin video upload area (protected by admin upload key)
- Generated **secure private delivery link** with token + expiration
- Funeral homes can play/download final tribute video from secure link

## Business Details Configured

- Business name: **Lasting Tribute Company**
- Business email: **lastingtributecompany@gmail.com**
- Contact name: **Julie Brown**
- Contact phone: **448 448 6491**
- PayPal receiving account: **rangerbleau11@gmail.com**
- Package price: **$299.00**

## Run Locally

```bash
cd lasting-tribute-company-app
npm install
SESSION_SECRET="replace-with-strong-secret" ADMIN_UPLOAD_KEY="replace-with-admin-key" npm start
```

Then open:
- Main app: `http://localhost:3000`

## Environment Variables

- `SESSION_SECRET` (required for production)
- `ADMIN_UPLOAD_KEY` (required for admin delivery uploads)
- `DELIVERY_EXPIRY_DAYS` (default `180`)

## Data Storage

- Funeral home users: `data/users.json`
- Orders metadata: `data/orders.json`
- Delivery metadata: `data/deliveries.json`
- Uploaded photos/videos: `uploads/`

## Production Deployment Notes (recommended next)

1. Deploy on Render/Railway/Fly.io/VPS with HTTPS.
2. Set strong `SESSION_SECRET` and `ADMIN_UPLOAD_KEY` env vars.
3. Move uploads/storage to S3 or Cloudinary.
4. Add PayPal webhook verification for payment confirmation.
5. Add legal pages (privacy policy, terms, media consent).
6. Add backup/retention policy.

## Suggested Partner Discount Program (example)

- 5+ tribute orders/month: 10% off
- 10+ tribute orders/month: 15% off
- Annual contract partner: custom pricing
