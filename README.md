# Velox Ledger

A secure retail ledger for shop owners and customers, with JWT authentication, password recovery email, transaction-derived balances, analytics, and optional face recognition.

## Stack
- Frontend: React + Vite + Tailwind Vite plugin + Lucide
- API: Node.js + Express + MongoDB/Mongoose
- Auth: JWT + bcryptjs
- Password recovery: Nodemailer (Gmail SMTP/App Password)
- Face microservice: Python + FastAPI + DeepFace/ArcFace + OpenCV

## Project structure
```text
velox-ledger/
├── frontend/
├── backend/
│   └── face-service/
├── README.md
└── .gitignore
```

## 1. MongoDB
Run MongoDB locally on `27017`, or set `MONGODB_URI` to your MongoDB connection string.

## 2. Backend
```bash
cd backend
npm install
copy .env.example .env
```
Edit `.env` and set `MONGODB_URI` and a long random `JWT_SECRET`.

For forgot-password email, configure a Gmail account with 2-Step Verification and a Gmail App Password:
```env
EMAIL_SERVICE=gmail
EMAIL_USER=yourgmail@gmail.com
EMAIL_APP_PASSWORD=your_16_character_app_password
EMAIL_FROM=Velox Ledger <yourgmail@gmail.com>
FRONTEND_URL=http://localhost:5173
```

Start:
```bash
npm start
```
Seed the owner once if your database has no owner:
```bash
npm run seed:owner
```
Demo owner credentials created by the seed script:
- Email: `owner@velox.com`
- Mobile: `9999999999`
- Password: `admin123`

## 3. Face service
```bash
cd backend/face-service
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 5001
```
The first DeepFace/ArcFace run may download model assets. Do not commit the virtual environment or downloaded model caches.

## 4. Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```
Open `http://localhost:5173`.

## Security notes
- JWT access tokens expire according to `JWT_EXPIRES_IN` (default 8h).
- Passwords are stored as bcrypt hashes.
- Password-reset tokens are random, hashed before storage, single-use, and expire after 15 minutes.
- Forgot-password responses do not reveal whether an email exists.
- Customers cannot access owner endpoints or face endpoints.
- Face recognition is identity-only and never creates or changes financial transactions.
- Never commit `.env` or real email/database credentials.

## Financial model
Balances are derived from transactions:
`balance = total DEBT - total PAYMENT`
A positive balance is due; a negative balance is an advance.

## Analytics
The owner Analytics page uses real MongoDB transactions to display:
- Sales / debt added
- Collections / payments
- Daily transaction volume
- Sales vs collection mix
- 7, 30 and 90 day views

## Manual face testing
Camera permissions, real-face extraction, lighting/angle behavior, and the recognition threshold must be tested on a real device before production use.

## Live multi-face customer scanner

The owner dashboard includes a separate **Multi-face store scanner** for crowded-shop use. It keeps the existing single-face registration flow intact and adds `POST /api/owner/face/scan`. The browser sends sampled camera frames to the Node API; the Python face service detects all visible faces and extracts one ArcFace embedding per detected face. Node compares each embedding with registered active customers and returns customer profile/ledger totals. Unknown faces are displayed as unknown and never create accounts automatically.

Recognition is intentionally sampled rather than run on every video frame. The scanner prevents overlapping requests, keeps the camera preview smooth, and requires an explicit owner action before a debt or payment is recorded.

### Services

- Frontend: `http://localhost:5173`
- Node API: `http://localhost:5000`
- Face service: `http://127.0.0.1:5001`
- Multi-face Python endpoint: `POST /extract-embeddings`
- Multi-face Node endpoint: `POST /api/owner/face/scan`

### Face registration vs live scanning

`CameraModal.jsx` remains the single-person registration component. `LiveMultiFaceScanner.jsx` is the separate room/store scanner. This prevents the crowded-shop workflow from changing the stricter one-face registration requirement.
