# 🛑 שלטי הצפון — מערכת תמחור מתקדמת

מערכת תמחור branded עם Authentication מלא לחברת שלטים.

## ✨ תכונות

- 🔐 **Authentication** - כניסה נפרדת למנהלים ולקוחות (JWT)
- 👑 **Admin Panel** - ניהול חומרים, לקוחות, והיסטוריית הצעות
- 💰 **מחשבון הצעות** - תמחור לפי מ"ר עם חומרי הדפסה/בסיס/למינציה
- 📱 **Responsive** - עובד על מובייל ודסקטופ
- 🇮🇱 **RTL עברית** - ממשק עברי מלא

## 🚀 הרצה מהירה (Local)

### 1. Backend (Python/FastAPI)

```bash
cd shlate-tzafon

# התקנת חבילות Python
pip install -r requirements.txt

# הרצת השרת
python pricing_v4_auth.py
# או:
uvicorn pricing_v4_auth:app --reload --port 8000
```

השרת יעלה על: http://localhost:8000
תיעוד API: http://localhost:8000/docs

### 2. Frontend (React/Vite)

```bash
# טרמינל חדש, באותה תיקייה
npm install
npm run dev
```

האפליקציה תעלה על: http://localhost:3000

## 👤 משתמשי ברירת מחדל

| סוג | שם משתמש | סיסמה |
|-----|-----------|-------|
| 👑 מנהל | `admin` | `admin123` |
| 👤 לקוח | הרשמה עצמאית | לפי בחירה |

## 📁 מבנה הפרויקט

```
shlate-tzafon/
├── pricing_v4_auth.py   # FastAPI Backend
├── pricing_v4.db        # SQLite DB (נוצר אוטומטית)
├── requirements.txt     # Python packages
├── package.json         # Node packages
├── vite.config.js       # Vite config
├── Dockerfile           # Docker production
├── .env.example         # Environment variables
├── .gitignore
├── src/
│   ├── App.jsx          # React main component
│   ├── App.css          # Styles
│   └── index.jsx        # React entry
└── public/
    └── index.html       # HTML base
```

## 🌐 GitHub Push

```bash
# צור repository חדש ב-GitHub בשם shlate-tzafon, ואז:
git remote add origin https://github.com/YOUR_USERNAME/shlate-tzafon.git
git branch -M main
git push -u origin main
```

## 🐳 Docker (Production)

```bash
# Build
docker build -t shlate-tzafon .

# Run
docker run -p 8000:8000 -e SECRET_KEY=your-secret-key shlate-tzafon
```

## 🔒 .env לפרודקשן

```bash
cp .env.example .env
# ערוך את .env עם מפתח סודי אמיתי:
SECRET_KEY=super-secret-random-string-here
```

## 📊 API Endpoints

| Method | Endpoint | תיאור |
|--------|----------|-------|
| POST | `/api/auth/admin/login` | כניסת מנהל |
| POST | `/api/auth/login` | כניסת לקוח |
| POST | `/api/users/register` | הרשמת לקוח |
| GET | `/api/materials` | רשימת חומרים |
| POST | `/api/quotes/calculate` | חישוב הצעת מחיר |
| GET | `/api/admin/materials` | ניהול חומרים (Admin) |
| GET | `/api/admin/users` | רשימת לקוחות (Admin) |
| GET | `/api/admin/quotes` | היסטוריית הצעות (Admin) |

---

בנוי עם ❤️ עבור שלטי הצפון
