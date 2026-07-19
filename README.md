# MedEasy 🩺

**Voice AI for Insurance-Friendly Healthcare**

A fully functional healthcare dashboard webapp with voice input/output powered by the browser's built-in Speech APIs.

## 🚀 Live Features

### 🛡️ Insurance Explainer
- Enter your plan details (PPO/HMO/EPO/HDHP, deductible, copay, coinsurance, OOP max)
- Ask questions in plain English — get instant AI-powered answers
- 8 quick-question chips, glossary of 10+ terms
- Voice input (microphone) + voice output (text-to-speech)

### 🏥 Hospital Finder
- Search 12 in-network hospitals by city and specialty
- Filter by Emergency, Cardiology, Orthopedics, Oncology, Pediatrics, Neurology, General
- "Book Here" links directly to Appointment Booking
- Voice search supported

### 📅 Appointment Booking
- 5-step wizard: Doctor → Reason → Date & Time → Patient Info → Confirmation
- 6 in-network doctor profiles
- Interactive calendar + 16 time slots
- Generates a booking ID with voice confirmation

### 🩺 Symptom Checker (Triage)
- Type or speak symptoms → get urgency classification
- 🚨 Emergency / ⚠️ Urgent / ✅ Routine
- 25+ conditions in the database
- Recommends care pathway + links to Hospital Finder & Booking

## 🛠️ Tech Stack

- **HTML / CSS / JavaScript** — pure frontend, no framework needed
- **Web Speech API** — browser-native speech recognition (Chrome/Edge)
- **SpeechSynthesis API** — browser-native text-to-speech
- **n8n + GPT-4 + ElevenLabs** — the real backend pipeline (see project description)

## 📁 Files

| File | Purpose |
|------|---------|
| `index.html` | Full app shell + all 4 page panels |
| `style.css` | Dark glassmorphism dashboard UI |
| `app.js` | All 4 tool engines + voice + routing |
| `vercel.json` | Vercel static deployment config |

## 🌐 Deployment

Deployed on Vercel. Connect this repo at [vercel.com/new](https://vercel.com/new) and deploy instantly.

## 🗣️ Voice Support

Works best in **Chrome** or **Edge** for full speech recognition support.
Click the **"Speak"** button in the top-right on any page to use your microphone.

---

*Formerly known as MediCall — built Jun 2026*
