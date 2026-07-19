/* ================================================================
   MedEasy — Feature API Routes (all protected by JWT)
   POST /api/insurance    — AI insurance explainer
   GET  /api/hospitals    — Hospital search
   POST /api/booking      — Save appointment
   GET  /api/booking      — List user's appointments
   POST /api/triage       — Symptom checker
   ================================================================ */

'use strict';

const express  = require('express');
const fetch    = require('node-fetch');
const { getDb } = require('../db/database');

const router = express.Router();

// ── Utility: forward to n8n webhook or fallback ──────────────────────────

async function callN8n(webhookUrl, payload) {
  if (!webhookUrl) return null; // No webhook configured → use fallback
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 30000
    });
    if (!res.ok) throw new Error(`n8n responded ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[n8n] Webhook call failed, using fallback:', err.message);
    return null;
  }
}

// ── POST /api/insurance ────────────────────────────────────────────────────

router.post('/insurance', async (req, res) => {
  try {
    const { query, plan } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required.' });

    // Try n8n first
    const n8nResult = await callN8n(process.env.N8N_INSURANCE_WEBHOOK, { query, plan, userId: req.user.id });

    if (n8nResult && n8nResult.answer) {
      return res.json({ answer: n8nResult.answer, source: 'ai' });
    }

    // Local fallback — smart rule-based responses
    const answer = insuranceFallback(query, plan || {});
    res.json({ answer, source: 'local' });

  } catch (err) {
    console.error('[api/insurance]', err);
    res.status(500).json({ error: 'Failed to process insurance query.' });
  }
});

// ── GET /api/hospitals ─────────────────────────────────────────────────────

router.get('/hospitals', (req, res) => {
  try {
    const { city = '', specialty = 'all' } = req.query;

    let hospitals = HOSPITAL_DATA;

    if (city.trim()) {
      const q = city.toLowerCase();
      hospitals = hospitals.filter(h =>
        h.city.toLowerCase().includes(q) ||
        h.name.toLowerCase().includes(q) ||
        h.zip.includes(q)
      );
    }

    if (specialty && specialty !== 'all') {
      hospitals = hospitals.filter(h =>
        h.specialties.some(s => s.toLowerCase() === specialty.toLowerCase())
      );
    }

    res.json({ hospitals, total: hospitals.length });
  } catch (err) {
    console.error('[api/hospitals]', err);
    res.status(500).json({ error: 'Failed to search hospitals.' });
  }
});

// ── POST /api/booking ──────────────────────────────────────────────────────

router.post('/booking', async (req, res) => {
  try {
    const {
      doctorName, doctorSpecialty, hospital,
      apptDate, apptTime, reason,
      patientName, patientEmail, patientPhone,
      insuranceId, insuranceProvider
    } = req.body;

    // Basic validation
    if (!doctorName || !apptDate || !apptTime || !patientName || !patientEmail) {
      return res.status(400).json({ error: 'Required booking fields are missing.' });
    }

    const pool = getDb();

    // Generate unique booking ID
    const bookingId = 'ME-' + Math.floor(100000 + Math.random() * 900000);

    await pool.query(`
      INSERT INTO appointments
        (booking_id, user_id, doctor_name, doctor_specialty, hospital,
         appt_date, appt_time, reason, patient_name, patient_email,
         patient_phone, insurance_id, insurance_provider)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      bookingId, req.user.id, doctorName, doctorSpecialty || '', hospital || '',
      apptDate, apptTime, reason || '',
      patientName, patientEmail, patientPhone || '',
      insuranceId || '', insuranceProvider || ''
    ]);

    // Optionally notify n8n (fire and forget)
    if (process.env.N8N_BOOKING_WEBHOOK) {
      callN8n(process.env.N8N_BOOKING_WEBHOOK, {
        bookingId, doctorName, apptDate, apptTime, patientName, patientEmail
      }).catch(() => {});
    }

    res.status(201).json({
      message: 'Appointment confirmed!',
      bookingId,
      status: 'confirmed'
    });

  } catch (err) {
    console.error('[api/booking]', err);
    res.status(500).json({ error: 'Failed to save appointment.' });
  }
});

// ── GET /api/booking ───────────────────────────────────────────────────────

router.get('/booking', async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.query(
      'SELECT * FROM appointments WHERE user_id = $1 ORDER BY appt_date DESC, appt_time DESC',
      [req.user.id]
    );

    res.json({ appointments: result.rows });
  } catch (err) {
    console.error('[api/booking GET]', err);
    res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// ── POST /api/triage ───────────────────────────────────────────────────────

router.post('/triage', async (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms) return res.status(400).json({ error: 'Symptoms are required.' });

    // Try n8n first
    const n8nResult = await callN8n(process.env.N8N_TRIAGE_WEBHOOK, { symptoms, userId: req.user.id });

    let result;
    if (n8nResult && n8nResult.urgency) {
      result = n8nResult;
    } else {
      // Local fallback
      result = triageFallback(symptoms);
    }

    // Save to DB
    const pool = getDb();
    await pool.query(
      'INSERT INTO symptom_checks (user_id, symptoms, urgency, result_json) VALUES ($1, $2, $3, $4)',
      [req.user.id, symptoms, result.urgency, JSON.stringify(result)]
    );

    res.json({ ...result, source: n8nResult ? 'ai' : 'local' });

  } catch (err) {
    console.error('[api/triage]', err);
    res.status(500).json({ error: 'Failed to assess symptoms.' });
  }
});

// ── GET /api/profile/appointments ─────────────────────────────────────────

router.get('/profile/appointments', async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.query(`
      SELECT booking_id, doctor_name, doctor_specialty, hospital,
             appt_date, appt_time, status, created_at
      FROM appointments
      WHERE user_id = $1
      ORDER BY appt_date DESC
      LIMIT 20
    `, [req.user.id]);
    res.json({ appointments: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// LOCAL FALLBACK DATA
// ════════════════════════════════════════════════════════════════════════════

// ── Insurance fallback ───────────────────────────────────────────────────

function insuranceFallback(query, plan) {
  const q = query.toLowerCase();
  const deductible = plan.deductible || 1500;
  const copay = plan.copay || 30;
  const coinsurance = plan.coinsurance || 20;
  const oopMax = plan.oopMax || 6000;
  const planType = plan.type || 'PPO';

  if (q.includes('deductible')) return `Your deductible is **$${deductible.toLocaleString()}**. This is the amount you pay before your ${planType} plan starts covering costs. After meeting it, you pay only your ${coinsurance}% coinsurance or flat copays.`;
  if (q.includes('copay')) return `Your copay is **$${copay}** per primary care visit. Specialists may have a higher copay ($50–$75). You pay this fixed amount each visit regardless of total service cost.`;
  if (q.includes('coinsurance')) return `Your coinsurance is **${coinsurance}%**. After meeting your $${deductible.toLocaleString()} deductible, you pay ${coinsurance}% of covered service costs and insurance pays ${100 - coinsurance}%—until you hit your $${oopMax.toLocaleString()} out-of-pocket max.`;
  if (q.includes('out of pocket') || q.includes('maximum') || q.includes('oop')) return `Your out-of-pocket maximum is **$${oopMax.toLocaleString()}**. Once you've paid this amount in a plan year, your insurance covers 100% of all covered services for the rest of the year.`;
  if (q.includes('emergency') || q.includes('er')) return `Emergency room visits are covered even out-of-network. ER copay is typically $250–$350, waived if admitted. Urgent care visits are usually $${copay + 20}–$${copay + 40}. After your deductible, ${coinsurance}% coinsurance applies.`;
  if (q.includes('prescription') || q.includes('drug')) return `Drug coverage uses a formulary (approved drug list). Generics: ~$10–15. Brand preferred: ~$40–60. Non-preferred brand: ~$70–100. Check your plan's formulary for specific medications.`;
  if (q.includes('mental health') || q.includes('therapy')) return `Mental health visits are covered the same as medical benefits (Mental Health Parity Act). Your standard $${copay} copay applies for outpatient therapy after meeting your deductible.`;
  if (q.includes('specialist')) return `${planType === 'HMO' ? 'You need a referral from your primary care physician first.' : 'You can see specialists directly without a referral.'} Specialist copays are typically $50–$75.`;
  if (q.includes('network')) return `In-network providers have negotiated rates with your insurer—much lower costs. ${planType === 'HMO' ? 'Out-of-network is generally NOT covered except in emergencies.' : 'Out-of-network is covered but at a higher cost.'}`;

  return `On your **${planType} plan**: $${deductible.toLocaleString()} deductible → $${copay} copay per visit → ${coinsurance}% coinsurance → $${oopMax.toLocaleString()} out-of-pocket max. Ask about deductible, copay, coinsurance, prescriptions, emergencies, specialists, or network coverage.`;
}

// ── Triage fallback ──────────────────────────────────────────────────────

function triageFallback(symptoms) {
  const s = symptoms.toLowerCase();

  const emergency = ['chest pain', 'heart attack', 'stroke', 'unconscious', 'not breathing',
    'severe bleeding', 'seizure', 'difficulty breathing', 'shortness of breath',
    'anaphylaxis', 'allergic reaction', 'overdose', 'suicidal', 'severe head injury'];

  const urgent = ['high fever', 'fever over 103', '104', 'broken bone', 'fracture',
    'severe pain', 'vomiting blood', 'blood in urine', 'severe headache',
    'suspected infection', 'animal bite', 'deep cut', 'moderate pain',
    'ear infection', 'urinary tract', 'uti', 'abdominal pain'];

  const isEmergency = emergency.some(k => s.includes(k));
  const isUrgent    = !isEmergency && urgent.some(k => s.includes(k));

  if (isEmergency) {
    return {
      urgency: 'emergency',
      title: '🚨 Emergency',
      message: 'Your symptoms suggest a potentially life-threatening emergency. Call 911 or go to the nearest emergency room immediately.',
      action: 'Call 911 Now',
      nextSteps: ['Call 911 immediately', 'Do not drive yourself', 'Keep the patient calm and still', 'Be ready to describe all symptoms to paramedics'],
      carePathway: 'Emergency Room (ER)'
    };
  }

  if (isUrgent) {
    return {
      urgency: 'urgent',
      title: '⚠️ Urgent Care Needed',
      message: 'Your symptoms need attention today. Visit an urgent care center or call your doctor for a same-day appointment.',
      action: 'Find Urgent Care',
      nextSteps: ['Visit urgent care within the next few hours', 'Call your primary care physician', 'Monitor symptoms closely—if worsening, go to ER', 'Bring your insurance card and medication list'],
      carePathway: 'Urgent Care Center'
    };
  }

  return {
    urgency: 'routine',
    title: '✅ Routine Care',
    message: 'Your symptoms appear to be non-emergency. Schedule an appointment with your primary care physician within the next few days.',
    action: 'Book Appointment',
    nextSteps: ['Schedule a routine appointment', 'Rest and stay hydrated', 'Over-the-counter medications may help', 'Monitor for any worsening symptoms'],
    carePathway: 'Primary Care Physician'
  };
}

// ── Hospital data ─────────────────────────────────────────────────────────

const HOSPITAL_DATA = [
  { id: 1, name: 'New York Presbyterian Hospital', city: 'New York', state: 'NY', zip: '10032', phone: '(212) 305-2500', rating: 4.8, distance: '0.8 mi', specialties: ['Cardiology', 'Neurology', 'Oncology', 'Emergency', 'General'], emergency: true, accepting: true, beds: 2478 },
  { id: 2, name: 'Mount Sinai Hospital', city: 'New York', state: 'NY', zip: '10029', phone: '(212) 241-6500', rating: 4.7, distance: '1.2 mi', specialties: ['Cardiology', 'Orthopedics', 'Pediatrics', 'Emergency', 'General'], emergency: true, accepting: true, beds: 1139 },
  { id: 3, name: 'Johns Hopkins Hospital', city: 'Baltimore', state: 'MD', zip: '21287', phone: '(410) 955-5000', rating: 4.9, distance: '3.1 mi', specialties: ['Oncology', 'Neurology', 'Cardiology', 'Emergency', 'General'], emergency: true, accepting: true, beds: 1162 },
  { id: 4, name: 'Rush University Medical Center', city: 'Chicago', state: 'IL', zip: '60612', phone: '(312) 942-5000', rating: 4.6, distance: '2.3 mi', specialties: ['Orthopedics', 'Neurology', 'General', 'Emergency'], emergency: true, accepting: true, beds: 676 },
  { id: 5, name: 'Northwestern Memorial Hospital', city: 'Chicago', state: 'IL', zip: '60611', phone: '(312) 926-2000', rating: 4.8, distance: '1.9 mi', specialties: ['Cardiology', 'Oncology', 'General', 'Emergency', 'Pediatrics'], emergency: true, accepting: true, beds: 894 },
  { id: 6, name: 'Cedars-Sinai Medical Center', city: 'Los Angeles', state: 'CA', zip: '90048', phone: '(310) 423-3277', rating: 4.7, distance: '4.5 mi', specialties: ['Cardiology', 'Oncology', 'Orthopedics', 'Emergency', 'General'], emergency: true, accepting: true, beds: 886 },
  { id: 7, name: 'Stanford Health Care', city: 'Palo Alto', state: 'CA', zip: '94304', phone: '(650) 723-4000', rating: 4.9, distance: '5.2 mi', specialties: ['Neurology', 'Oncology', 'Cardiology', 'General', 'Emergency'], emergency: true, accepting: true, beds: 613 },
  { id: 8, name: 'Cleveland Clinic', city: 'Cleveland', state: 'OH', zip: '44195', phone: '(216) 444-2200', rating: 4.9, distance: '6.1 mi', specialties: ['Cardiology', 'Orthopedics', 'Oncology', 'Emergency', 'General'], emergency: true, accepting: true, beds: 1302 },
  { id: 9, name: 'Boston Children\'s Hospital', city: 'Boston', state: 'MA', zip: '02115', phone: '(617) 355-6000', rating: 4.9, distance: '2.7 mi', specialties: ['Pediatrics', 'Neurology', 'General', 'Emergency'], emergency: true, accepting: true, beds: 404 },
  { id: 10, name: 'UCSF Medical Center', city: 'San Francisco', state: 'CA', zip: '94143', phone: '(415) 476-1000', rating: 4.8, distance: '3.4 mi', specialties: ['Oncology', 'Neurology', 'General', 'Emergency', 'Cardiology'], emergency: true, accepting: true, beds: 800 },
  { id: 11, name: 'Houston Methodist Hospital', city: 'Houston', state: 'TX', zip: '77030', phone: '(713) 790-3311', rating: 4.7, distance: '4.8 mi', specialties: ['Cardiology', 'Orthopedics', 'General', 'Emergency'], emergency: true, accepting: true, beds: 912 },
  { id: 12, name: 'Mayo Clinic Hospital', city: 'Rochester', state: 'MN', zip: '55905', phone: '(507) 255-5123', rating: 4.9, distance: '8.2 mi', specialties: ['General', 'Oncology', 'Cardiology', 'Neurology', 'Emergency', 'Orthopedics', 'Pediatrics'], emergency: true, accepting: true, beds: 1265 },
];

module.exports = router;
