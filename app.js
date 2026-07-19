/* ================================================================
   MedEasy — Working Dashboard App JavaScript
   All logic: routing, voice engine, 4 tool engines
   ================================================================ */

'use strict';

/* ================================================================
   ROUTING — Page navigation
   ================================================================ */
const Router = (() => {
  const panels = document.querySelectorAll('.page-panel');
  const navItems = document.querySelectorAll('.nav-item');
  const topbarTitle = document.getElementById('topbar-title');
  const topbarSub = document.getElementById('topbar-sub');

  const pages = {
    insurance: { title: 'Insurance Explainer', sub: 'Ask questions about your plan in plain English' },
    hospitals: { title: 'Hospital Finder', sub: 'Find in-network hospitals by city & specialty' },
    booking:   { title: 'Appointment Booking', sub: 'Book with a doctor in a few steps' },
    triage:    { title: 'Symptom Checker', sub: 'Describe your symptoms, get urgency guidance' },
  };

  function go(pageId) {
    panels.forEach(p => p.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));

    const panel = document.getElementById('page-' + pageId);
    if (panel) panel.classList.add('active');

    const navItem = document.querySelector(`[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');

    const info = pages[pageId];
    if (info) {
      topbarTitle.textContent = info.title;
      topbarSub.textContent = info.sub;
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => go(item.dataset.page));
  });

  return { go };
})();


/* ================================================================
   VOICE ENGINE — SpeechRecognition + SpeechSynthesis
   ================================================================ */
const VoiceEngine = (() => {
  const overlay = document.getElementById('voice-overlay');
  const overlayLabel = document.getElementById('voice-overlay-label');
  const micBtn = document.getElementById('mic-btn');
  const voiceDot = document.getElementById('voice-dot');
  const voiceStatusText = document.getElementById('voice-status-text');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let onResultCallback = null;
  let currentState = 'idle'; // idle | listening | processing | speaking

  function setState(state, label = '') {
    currentState = state;
    voiceDot.className = 'voice-dot ' + (state !== 'idle' ? state : '');
    const labels = { idle: 'Voice Ready', listening: 'Listening...', processing: 'Processing...', speaking: 'Speaking...' };
    voiceStatusText.textContent = label || labels[state] || 'Voice Ready';
  }

  function speak(text, onDone) {
    if (!window.speechSynthesis) { if (onDone) onDone(); return; }
    window.speechSynthesis.cancel();
    setState('speaking');
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0; utt.pitch = 1.0; utt.volume = 1.0;

    // Try to use a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google US') || v.name.includes('Female'));
    if (preferred) utt.voice = preferred;

    utt.onend = () => { setState('idle'); if (onDone) onDone(); };
    utt.onerror = () => { setState('idle'); if (onDone) onDone(); };
    window.speechSynthesis.speak(utt);
  }

  function listen(callback) {
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    if (currentState === 'listening') { stopListening(); return; }

    onResultCallback = callback;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    overlay.classList.add('visible');
    overlayLabel.textContent = 'Listening...';
    setState('listening');

    micBtn.classList.add('listening');
    micBtn.querySelector('.mic-label').textContent = 'Stop';

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      overlayLabel.textContent = `"${transcript}"`;
      setState('processing', 'Processing...');
      setTimeout(() => {
        overlay.classList.remove('visible');
        setState('idle');
        micBtn.classList.remove('listening');
        micBtn.querySelector('.mic-label').textContent = 'Speak';
        if (onResultCallback) onResultCallback(transcript);
      }, 800);
    };

    recognition.onerror = () => {
      overlay.classList.remove('visible');
      setState('idle');
      micBtn.classList.remove('listening');
      micBtn.querySelector('.mic-label').textContent = 'Speak';
    };

    recognition.onend = () => {
      if (currentState === 'listening') {
        overlay.classList.remove('visible');
        setState('idle');
        micBtn.classList.remove('listening');
        micBtn.querySelector('.mic-label').textContent = 'Speak';
      }
    };

    recognition.start();
  }

  function stopListening() {
    if (recognition) recognition.stop();
    overlay.classList.remove('visible');
    setState('idle');
    micBtn.classList.remove('listening');
    micBtn.querySelector('.mic-label').textContent = 'Speak';
  }

  // Global mic button
  micBtn.addEventListener('click', () => {
    const activePage = document.querySelector('.page-panel.active');
    const pageId = activePage ? activePage.id.replace('page-', '') : 'insurance';

    const handlers = {
      insurance: () => listen(t => InsuranceEngine.handleQuery(t)),
      hospitals: () => listen(t => HospitalEngine.handleVoiceSearch(t)),
      booking:   () => listen(t => BookingEngine.handleVoice(t)),
      triage:    () => listen(t => TriageEngine.handleInput(t)),
    };

    if (handlers[pageId]) handlers[pageId]();
  });

  // Cancel overlay
  document.getElementById('voice-overlay-cancel').addEventListener('click', stopListening);

  return { speak, listen, setState };
})();


/* ================================================================
   PAGE 1 — INSURANCE EXPLAINER ENGINE
   ================================================================ */
const InsuranceEngine = (() => {
  // Plan state
  let plan = { type: 'PPO', deductible: 1500, copay: 30, coinsurance: 20, oopMax: 6000, inNetwork: true };

  // Glossary data
  const glossary = {
    'deductible': 'The amount you pay for covered health care services before your insurance plan starts to pay. For example, with a $1,500 deductible, you pay the first $1,500 of covered services yourself.',
    'copay': 'A fixed amount you pay for a covered health care service, usually at the time of service. For example, a $30 copay means you pay $30 per doctor visit.',
    'coinsurance': 'Your share of the costs of a covered health care service after you\'ve paid your deductible. For example, 20% coinsurance means you pay 20% and your insurance pays 80%.',
    'out-of-pocket maximum': 'The most you have to pay for covered services in a plan year. After you reach this amount, your insurance pays 100% of covered services.',
    'premium': 'The amount you pay every month to keep your health insurance coverage, regardless of whether you use medical services.',
    'in-network': 'Doctors, hospitals, and other health care providers who have agreed to provide services to your insurer\'s members at negotiated rates. In-network care is typically much cheaper.',
    'out-of-network': 'Providers who do not have an agreement with your insurance company. Using out-of-network providers usually costs significantly more.',
    'prior authorization': 'Approval from your health insurance plan before you can receive certain medications, procedures, or services. Without it, the plan may not pay.',
    'hmo': 'Health Maintenance Organization — a type of plan that requires you to choose a primary care physician (PCP) and get referrals to see specialists. Generally lower premiums but less flexibility.',
    'ppo': 'Preferred Provider Organization — a plan that lets you see any doctor without a referral, in-network or out-of-network. More flexibility, typically higher premiums.',
    'eob': 'Explanation of Benefits — a document sent by your insurer explaining what was covered, what was billed, what the insurer paid, and what you owe.',
    'formulary': 'Your insurance plan\'s list of covered prescription drugs. Drugs are divided into tiers with different copay amounts.',
  };

  // Intent → response mapping
  function getResponse(query) {
    const q = query.toLowerCase();

    if (q.includes('deductible')) {
      return `Your deductible is **$${plan.deductible.toLocaleString()}**. This is the amount you pay out-of-pocket before your ${plan.type} plan starts covering costs. Once you hit this amount for the year, your insurance kicks in and you'll only pay your ${plan.coinsurance}% coinsurance or copays.`;
    }
    if (q.includes('copay') || q.includes('co-pay') || q.includes('co pay')) {
      return `Your copay is **$${plan.copay}** per visit. This is the fixed amount you pay each time you see a covered in-network provider — regardless of what the provider charges. Specialist visits may have a higher copay (typically $50–$75).`;
    }
    if (q.includes('coinsurance') || q.includes('co-insurance')) {
      return `Your coinsurance is **${plan.coinsurance}%**. After you meet your $${plan.deductible.toLocaleString()} deductible, you pay ${plan.coinsurance}% of covered service costs and your insurer pays ${100 - plan.coinsurance}%. This continues until you reach your out-of-pocket maximum of $${plan.oopMax.toLocaleString()}.`;
    }
    if (q.includes('out of pocket') || q.includes('maximum') || q.includes('oop')) {
      return `Your out-of-pocket maximum is **$${plan.oopMax.toLocaleString()}**. Once you've paid this amount in a plan year (through deductibles, copays, and coinsurance), your insurance covers 100% of additional covered services for the rest of the year.`;
    }
    if (q.includes('specialist')) {
      return `To see a specialist on your ${plan.type} plan, ${plan.type === 'HMO' ? 'you need a referral from your primary care physician (PCP) first. Then' : 'you can book directly without a referral.'} You'll pay your specialist copay (typically $50–$75) or your $${plan.copay} copay if it's treated as a standard visit, depending on your plan's details.`;
    }
    if (q.includes('emergency') || q.includes('er') || q.includes('urgent care')) {
      return `For emergency care, your insurance covers it even out-of-network. Emergency room visits typically have a higher copay (often $250–$350) which is waived if you're admitted. Urgent care visits are usually $${plan.copay + 15}–$${plan.copay + 30}. After your deductible, coinsurance (${plan.coinsurance}%) applies.`;
    }
    if (q.includes('hospital') || q.includes('admit') || q.includes('inpatient')) {
      return `For hospital stays on your ${plan.type} plan, your deductible applies first ($${plan.deductible.toLocaleString()}). After that, you pay ${plan.coinsurance}% coinsurance until you hit your out-of-pocket maximum of $${plan.oopMax.toLocaleString()}. Always try to use in-network hospitals for the lowest costs.`;
    }
    if (q.includes('prescription') || q.includes('drug') || q.includes('medication')) {
      return `Prescription drug coverage depends on your plan's formulary (approved drug list). Drugs are placed in tiers: Tier 1 generics (lowest copay ~$10–15), Tier 2 preferred brands (~$40–60), Tier 3 non-preferred (~$70–100), and Tier 4 specialty drugs. Check your plan's formulary to confirm coverage for specific medications.`;
    }
    if (q.includes('mental health') || q.includes('therapy') || q.includes('counseling')) {
      return `Mental health and substance use disorder services are covered under the same terms as medical/surgical benefits (required by law under the Mental Health Parity Act). You'll pay your standard copay of $${plan.copay} for outpatient therapy visits after meeting your deductible.`;
    }
    if (q.includes('network') || q.includes('in-network') || q.includes('out of network')) {
      return `On your ${plan.type} plan, in-network providers have negotiated rates with your insurer — meaning much lower costs for you. Out-of-network providers ${plan.type === 'HMO' ? 'are generally NOT covered except in emergencies.' : 'are covered but at a higher cost — you\'ll likely pay a higher deductible and coinsurance percentage.'}`;
    }
    if (q.includes('how much') && q.includes('pay')) {
      return `On your ${plan.type} plan: You pay your $${plan.deductible.toLocaleString()} deductible first. After that, you pay $${plan.copay} copays for primary care visits, plus ${plan.coinsurance}% coinsurance on other services. Your maximum annual out-of-pocket is $${plan.oopMax.toLocaleString()} — after which insurance covers 100%.`;
    }
    if (q.includes('plan type') || q.includes('ppo') || q.includes('hmo')) {
      return plan.type === 'PPO'
        ? `You have a **PPO (Preferred Provider Organization)** plan. This gives you the flexibility to see any doctor — specialist or primary care — without a referral, in-network or out-of-network. In-network care is significantly cheaper. Great for people who want maximum choice.`
        : `You have an **HMO (Health Maintenance Organization)** plan. You must choose a primary care physician (PCP) who coordinates all your care and provides referrals to specialists. You generally cannot see out-of-network providers except in emergencies. Typically lower premiums.`;
    }

    // Fallback — look for glossary terms
    for (const [term, def] of Object.entries(glossary)) {
      if (q.includes(term)) {
        return def;
      }
    }

    return `I can help you understand your ${plan.type} insurance plan. Try asking about your **deductible** ($${plan.deductible.toLocaleString()}), **copay** ($${plan.copay}), **coinsurance** (${plan.coinsurance}%), or your **out-of-pocket maximum** ($${plan.oopMax.toLocaleString()}). You can also ask about specialist visits, emergencies, prescriptions, or network coverage.`;
  }

  function addBubble(text, type = 'ai') {
    const history = document.getElementById('insurance-chat-history');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;
    if (type === 'ai') {
      bubble.innerHTML = `<div class="ai-label">🩺 MedEasy AI</div>${formatText(text)}`;
    } else {
      bubble.textContent = text;
    }
    history.appendChild(bubble);
    history.scrollTop = history.scrollHeight;
  }

  function formatText(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--teal)">$1</strong>');
  }

  function handleQuery(query) {
    if (!query.trim()) return;
    addBubble(query, 'user');
    const response = getResponse(query);
    setTimeout(() => {
      addBubble(response, 'ai');
      VoiceEngine.speak(response.replace(/\*\*(.*?)\*\*/g, '$1').replace(/<[^>]*>/g, ''));
    }, 400);
  }

  function updatePlan() {
    plan.deductible = parseInt(document.getElementById('ins-deductible').value) || 1500;
    plan.copay = parseInt(document.getElementById('ins-copay').value) || 30;
    plan.coinsurance = parseInt(document.getElementById('ins-coinsurance').value) || 20;
    plan.oopMax = parseInt(document.getElementById('ins-oop').value) || 6000;
    document.getElementById('ins-chat-history-wrapper');
    addBubble(`Got it! Your plan is updated: ${plan.type} with a $${plan.deductible.toLocaleString()} deductible, $${plan.copay} copay, ${plan.coinsurance}% coinsurance, and $${plan.oopMax.toLocaleString()} out-of-pocket maximum. What would you like to know?`, 'ai');
    VoiceEngine.speak(`Plan updated. You have a ${plan.type} plan with a $${plan.deductible} deductible and a $${plan.copay} copay. What would you like to know?`);
  }

  // Init
  function init() {
    const chat = document.getElementById('insurance-chat-history');

    // Input row
    const input = document.getElementById('ins-query-input');
    document.getElementById('ins-send-btn').addEventListener('click', () => {
      if (input.value.trim()) { handleQuery(input.value.trim()); input.value = ''; }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) { handleQuery(input.value.trim()); input.value = ''; }
    });

    // Voice for insurance
    document.getElementById('ins-voice-btn').addEventListener('click', () => {
      VoiceEngine.listen(t => { handleQuery(t); });
    });

    // Plan type selector
    document.querySelectorAll('.plan-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.plan-type-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        plan.type = btn.dataset.type;
      });
    });

    // Plan save
    document.getElementById('ins-save-plan').addEventListener('click', updatePlan);

    // Suggestion chips
    document.querySelectorAll('.ins-chip').forEach(chip => {
      chip.addEventListener('click', () => { handleQuery(chip.textContent.trim()); });
    });

    // Glossary terms
    document.querySelectorAll('.glossary-term').forEach(term => {
      term.addEventListener('click', () => {
        const termName = term.dataset.term;
        if (glossary[termName]) {
          addBubble(`What is ${termName}?`, 'user');
          setTimeout(() => { addBubble(glossary[termName], 'ai'); }, 300);
        }
      });
    });

    // Welcome message
    setTimeout(() => {
      addBubble('👋 Hi! I\'m your MedEasy Insurance AI. Enter your plan details on the left, then ask me anything about your coverage — in plain English. Try: "What is my deductible?" or "How much do I pay for a specialist?"', 'ai');
    }, 400);
  }

  return { init, handleQuery };
})();


/* ================================================================
   PAGE 2 — HOSPITAL FINDER ENGINE
   ================================================================ */
const HospitalEngine = (() => {
  const hospitals = [
    { id: 1, name: 'NYU Langone Medical Center', address: '550 First Ave, New York, NY 10016', city: 'new york', distance: '1.2 mi', rating: 4.8, reviews: 3240, type: '🏥', specialties: ['Cardiology', 'Orthopedics', 'Neurology', 'General'], emergency: true, inNetwork: true },
    { id: 2, name: 'Mount Sinai Hospital', address: '1 Gustave L. Levy Pl, New York, NY 10029', city: 'new york', distance: '2.4 mi', rating: 4.7, reviews: 2891, type: '🏥', specialties: ['Cardiology', 'Oncology', 'Pediatrics', 'General'], emergency: true, inNetwork: true },
    { id: 3, name: 'NewYork-Presbyterian Hospital', address: '525 E 68th St, New York, NY 10065', city: 'new york', distance: '3.1 mi', rating: 4.9, reviews: 4120, type: '🏥', specialties: ['Neurology', 'Orthopedics', 'Cardiology', 'General'], emergency: true, inNetwork: true },
    { id: 4, name: 'Cedars-Sinai Medical Center', address: '8700 Beverly Blvd, Los Angeles, CA 90048', city: 'los angeles', distance: '0.8 mi', rating: 4.8, reviews: 3670, type: '🏥', specialties: ['Cardiology', 'Oncology', 'Orthopedics', 'General'], emergency: true, inNetwork: true },
    { id: 5, name: 'UCLA Health Santa Monica', address: '1250 16th St, Santa Monica, CA 90404', city: 'los angeles', distance: '4.2 mi', rating: 4.6, reviews: 1820, type: '🏥', specialties: ['Pediatrics', 'General', 'Neurology'], emergency: false, inNetwork: true },
    { id: 6, name: 'Rush University Medical Center', address: '1620 W Harrison St, Chicago, IL 60612', city: 'chicago', distance: '1.5 mi', rating: 4.7, reviews: 2340, type: '🏥', specialties: ['Orthopedics', 'Cardiology', 'General', 'Oncology'], emergency: true, inNetwork: true },
    { id: 7, name: 'Northwestern Memorial Hospital', address: '251 E Huron St, Chicago, IL 60611', city: 'chicago', distance: '2.0 mi', rating: 4.9, reviews: 3890, type: '🏥', specialties: ['General', 'Neurology', 'Oncology', 'Cardiology'], emergency: true, inNetwork: true },
    { id: 8, name: 'Massachusetts General Hospital', address: '55 Fruit St, Boston, MA 02114', city: 'boston', distance: '1.1 mi', rating: 4.9, reviews: 5120, type: '🏥', specialties: ['Cardiology', 'Neurology', 'Oncology', 'General', 'Pediatrics'], emergency: true, inNetwork: true },
    { id: 9, name: 'UCSF Medical Center', address: '505 Parnassus Ave, San Francisco, CA 94143', city: 'san francisco', distance: '0.5 mi', rating: 4.8, reviews: 2890, type: '🏥', specialties: ['General', 'Oncology', 'Pediatrics', 'Neurology'], emergency: true, inNetwork: true },
    { id: 10, name: 'Houston Methodist Hospital', address: '6565 Fannin St, Houston, TX 77030', city: 'houston', distance: '1.8 mi', rating: 4.7, reviews: 2210, type: '🏥', specialties: ['Cardiology', 'Orthopedics', 'General'], emergency: true, inNetwork: true },
    { id: 11, name: 'Memorial Sloan Kettering', address: '1275 York Ave, New York, NY 10065', city: 'new york', distance: '2.8 mi', rating: 4.9, reviews: 3010, type: '🏥', specialties: ['Oncology'], emergency: false, inNetwork: true },
    { id: 12, name: 'Lurie Children\'s Hospital', address: '225 E Chicago Ave, Chicago, IL 60611', city: 'chicago', distance: '2.5 mi', rating: 4.9, reviews: 1760, type: '🏥', specialties: ['Pediatrics', 'General'], emergency: true, inNetwork: true },
  ];

  let activeFilter = 'All';
  let currentResults = [...hospitals];

  const filterMap = {
    'All': () => true,
    'Emergency': h => h.emergency,
    'Cardiology': h => h.specialties.includes('Cardiology'),
    'Orthopedics': h => h.specialties.includes('Orthopedics'),
    'Oncology': h => h.specialties.includes('Oncology'),
    'Pediatrics': h => h.specialties.includes('Pediatrics'),
    'Neurology': h => h.specialties.includes('Neurology'),
    'General': h => h.specialties.includes('General'),
  };

  function renderHospitals(list) {
    const grid = document.getElementById('hospitals-grid');
    if (!list.length) {
      grid.innerHTML = `<div class="no-results"><span class="no-results-icon">🔍</span><p>No hospitals found for your search. Try a different city or specialty.</p></div>`;
      return;
    }
    grid.innerHTML = list.map(h => `
      <div class="hospital-card">
        <div class="hospital-card-top">
          <div class="hospital-icon">${h.type}</div>
          <div>${h.inNetwork ? '<span class="badge badge-green">✓ In-Network</span>' : '<span class="badge badge-orange">Out-of-Network</span>'}${h.emergency ? ' <span class="badge badge-red">🚨 ER</span>' : ''}</div>
        </div>
        <div class="hospital-name">${h.name}</div>
        <div class="hospital-address">📍 ${h.address}</div>
        <div class="hospital-meta">
          <span class="hospital-rating">★ ${h.rating}</span>
          <span>${h.reviews.toLocaleString()} reviews</span>
          <span>📏 ${h.distance}</span>
        </div>
        <div class="hospital-tags">${h.specialties.map(s => `<span class="hospital-tag">${s}</span>`).join('')}</div>
        <div class="hospital-card-actions">
          <button class="btn btn-primary btn-sm" onclick="HospitalEngine.bookHere(${h.id})">📅 Book Here</button>
          <button class="btn btn-outline btn-sm">📞 Call</button>
        </div>
      </div>
    `).join('');
  }

  function search() {
    const city = document.getElementById('hospital-city').value.toLowerCase().trim();
    const specialty = document.getElementById('hospital-specialty').value;

    let results = hospitals.filter(h => {
      const matchesCity = !city || h.city.includes(city) || h.address.toLowerCase().includes(city);
      const matchesSpecialty = specialty === 'all' || h.specialties.includes(specialty);
      const matchesFilter = filterMap[activeFilter] ? filterMap[activeFilter](h) : true;
      return matchesCity && matchesSpecialty && matchesFilter;
    });

    currentResults = results;
    renderHospitals(results);

    if (results.length) {
      VoiceEngine.speak(`Found ${results.length} in-network hospital${results.length > 1 ? 's' : ''}. The top result is ${results[0].name}, rated ${results[0].rating} stars, ${results[0].distance} away.`);
    }
  }

  function bookHere(hospitalId) {
    const hospital = hospitals.find(h => h.id === hospitalId);
    if (hospital) {
      BookingEngine.preSelectHospital(hospital);
      Router.go('booking');
    }
  }

  function handleVoiceSearch(transcript) {
    const t = transcript.toLowerCase();
    // Parse city
    const cities = ['new york', 'los angeles', 'chicago', 'boston', 'san francisco', 'houston'];
    for (const city of cities) {
      if (t.includes(city)) {
        document.getElementById('hospital-city').value = city;
        break;
      }
    }
    // Parse specialty
    const specs = { cardiology: 'Cardiology', orthopedics: 'Orthopedics', oncology: 'Oncology', pediatrics: 'Pediatrics', neurology: 'Neurology', general: 'General' };
    for (const [keyword, val] of Object.entries(specs)) {
      if (t.includes(keyword)) {
        document.getElementById('hospital-specialty').value = val;
        break;
      }
    }
    search();
  }

  function init() {
    document.getElementById('hospital-search-btn').addEventListener('click', search);
    document.getElementById('hospital-city').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.dataset.filter;
        search();
      });
    });

    document.getElementById('hosp-voice-btn').addEventListener('click', () => {
      VoiceEngine.listen(t => handleVoiceSearch(t));
    });

    // Initial render — all hospitals
    renderHospitals(hospitals);
  }

  return { init, bookHere, handleVoiceSearch };
})();

// Make bookHere accessible globally for inline onclick
window.HospitalEngine = HospitalEngine;


/* ================================================================
   PAGE 3 — APPOINTMENT BOOKING ENGINE
   ================================================================ */
const BookingEngine = (() => {
  let currentStep = 1;
  let booking = {
    doctor: null, hospital: null, specialty: '', reason: '',
    date: null, time: null, patient: {}
  };

  const doctors = [
    { id: 1, name: 'Dr. Sarah Chen', spec: 'Cardiologist', hospital: 'NYU Langone Medical Center', rating: '★★★★★ 4.9', avatar: '👩‍⚕️' },
    { id: 2, name: 'Dr. Michael Torres', spec: 'Orthopedic Surgeon', hospital: 'Mount Sinai Hospital', rating: '★★★★☆ 4.7', avatar: '👨‍⚕️' },
    { id: 3, name: 'Dr. Priya Sharma', spec: 'Neurologist', hospital: 'NewYork-Presbyterian', rating: '★★★★★ 4.8', avatar: '👩‍⚕️' },
    { id: 4, name: 'Dr. James Wilson', spec: 'General Practitioner', hospital: 'NYU Langone Medical Center', rating: '★★★★☆ 4.6', avatar: '👨‍⚕️' },
    { id: 5, name: 'Dr. Aisha Okonkwo', spec: 'Oncologist', hospital: 'Memorial Sloan Kettering', rating: '★★★★★ 4.9', avatar: '👩‍⚕️' },
    { id: 6, name: 'Dr. Robert Kim', spec: 'Pediatrician', hospital: 'Mount Sinai Hospital', rating: '★★★★★ 5.0', avatar: '👨‍⚕️' },
  ];

  // Calendar
  let calDate = new Date();
  calDate.setDate(1);
  let selectedDate = null;
  let selectedTime = null;

  const unavailableSlots = ['9:00 AM', '11:00 AM', '2:00 PM'];
  const timeSlots = ['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM'];

  function renderDoctors() {
    const list = document.getElementById('doctor-list');
    list.innerHTML = doctors.map(d => `
      <div class="doctor-card" data-id="${d.id}" onclick="BookingEngine.selectDoctor(${d.id})">
        <div class="doctor-avatar">${d.avatar}</div>
        <div>
          <div class="doctor-name">${d.name}</div>
          <div class="doctor-spec">${d.spec}</div>
          <div class="doctor-hospital">🏥 ${d.hospital}</div>
          <div class="doctor-rating">${d.rating}</div>
        </div>
      </div>
    `).join('');
  }

  function selectDoctor(id) {
    booking.doctor = doctors.find(d => d.id === id);
    document.querySelectorAll('.doctor-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.doctor-card[data-id="${id}"]`).classList.add('selected');
    document.getElementById('booking-next-1').disabled = false;
  }

  function renderCalendar() {
    const today = new Date();
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    document.getElementById('cal-month-label').textContent = `${months[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isToday = date.toDateString() === today.toDateString();
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
      const classes = ['cal-day', isPast || isWeekend ? 'disabled' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
      html += `<div class="${classes}" ${!isPast && !isWeekend ? `onclick="BookingEngine.selectDate(${year},${month},${d})"` : ''}>${d}</div>`;
    }

    document.getElementById('calendar-days').innerHTML = html;
  }

  function selectDate(year, month, day) {
    selectedDate = new Date(year, month, day);
    renderCalendar();
    renderTimeSlots();
    document.getElementById('booking-next-3').disabled = !(selectedDate && selectedTime);
  }

  function renderTimeSlots() {
    const container = document.getElementById('time-slots');
    container.innerHTML = timeSlots.map(t => {
      const unavail = unavailableSlots.includes(t);
      const sel = selectedTime === t;
      return `<div class="time-slot ${unavail ? 'unavailable' : ''} ${sel ? 'selected' : ''}" ${!unavail ? `onclick="BookingEngine.selectTime('${t}')"` : ''}>${t}</div>`;
    }).join('');
  }

  function selectTime(time) {
    selectedTime = time;
    booking.time = time;
    renderTimeSlots();
    document.getElementById('booking-next-3').disabled = !(selectedDate && selectedTime);
  }

  function goStep(step) {
    currentStep = step;
    document.querySelectorAll('.booking-step').forEach((s, i) => {
      s.classList.toggle('active', i + 1 === step);
    });
    document.querySelectorAll('.wizard-step').forEach((s, i) => {
      s.classList.remove('active', 'done');
      if (i + 1 === step) s.classList.add('active');
      if (i + 1 < step) s.classList.add('done');
    });
  }

  function preSelectHospital(hospital) {
    booking.hospital = hospital;
    // Pre-filter doctors for this hospital
    const doc = doctors.find(d => d.hospital === hospital.name) || doctors[3];
    booking.doctor = doc;
  }

  function confirm() {
    const name = document.getElementById('patient-name').value || 'John Doe';
    const dob = document.getElementById('patient-dob').value || 'N/A';
    const insId = document.getElementById('patient-ins-id').value || 'INS-000000';
    booking.patient = { name, dob, insId };

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = selectedDate ? `${months[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}` : 'N/A';
    const bookingId = 'ME-' + Math.floor(100000 + Math.random() * 900000);

    document.getElementById('confirm-booking-id').textContent = `Booking ID: ${bookingId}`;
    document.getElementById('confirm-doctor').textContent = booking.doctor ? booking.doctor.name : 'N/A';
    document.getElementById('confirm-specialty').textContent = booking.doctor ? booking.doctor.spec : 'N/A';
    document.getElementById('confirm-hospital').textContent = booking.doctor ? booking.doctor.hospital : 'N/A';
    document.getElementById('confirm-date').textContent = dateStr;
    document.getElementById('confirm-time').textContent = selectedTime || 'N/A';
    document.getElementById('confirm-patient').textContent = name;
    document.getElementById('confirm-ins').textContent = insId;

    goStep(5);
    VoiceEngine.speak(`Your appointment has been confirmed! You're booked with ${booking.doctor ? booking.doctor.name : 'your doctor'} on ${dateStr} at ${selectedTime}. Your booking ID is ${bookingId}. We'll send a confirmation to your email.`);
  }

  function handleVoice(transcript) {
    const t = transcript.toLowerCase();
    if (currentStep === 1) {
      const doc = doctors.find(d => d.name.toLowerCase().includes(t) || d.spec.toLowerCase().includes(t));
      if (doc) selectDoctor(doc.id);
    }
  }

  function init() {
    renderDoctors();
    renderCalendar();
    renderTimeSlots();

    // Step navigation
    document.getElementById('booking-next-1').addEventListener('click', () => {
      if (!booking.doctor) return;
      goStep(2);
    });

    document.getElementById('booking-next-2').addEventListener('click', () => {
      const reason = document.getElementById('booking-reason').value.trim();
      if (!reason) return;
      booking.reason = reason;
      booking.specialty = document.getElementById('booking-specialty').value;
      goStep(3);
    });

    document.getElementById('booking-back-2').addEventListener('click', () => goStep(1));

    document.getElementById('booking-next-3').addEventListener('click', () => {
      if (!selectedDate || !selectedTime) return;
      goStep(4);
    });

    document.getElementById('booking-back-3').addEventListener('click', () => goStep(2));
    document.getElementById('booking-back-4').addEventListener('click', () => goStep(3));
    document.getElementById('booking-confirm').addEventListener('click', confirm);
    document.getElementById('booking-new').addEventListener('click', () => { goStep(1); selectedDate = null; selectedTime = null; booking = { doctor: null, hospital: null, specialty: '', reason: '', date: null, time: null, patient: {} }; renderDoctors(); renderCalendar(); renderTimeSlots(); });

    document.getElementById('cal-prev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
    document.getElementById('cal-next').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });
  }

  return { init, selectDoctor, selectDate, selectTime, preSelectHospital, handleVoice };
})();

window.BookingEngine = BookingEngine;


/* ================================================================
   PAGE 4 — SYMPTOM CHECKER / TRIAGE ENGINE
   ================================================================ */
const TriageEngine = (() => {
  let conversationState = 'initial'; // initial | gathering | result
  let symptoms = [];
  let followUpPending = null;

  const symptomDB = {
    // EMERGENCY
    'chest pain': { urgency: 'emergency', reason: 'Chest pain can indicate a heart attack or other serious cardiac event.', care: 'Call 911 immediately or go to the nearest Emergency Room.', followUp: 'Is the pain radiating to your arm, jaw, or back?' },
    'difficulty breathing': { urgency: 'emergency', reason: 'Severe breathing difficulty can indicate a pulmonary emergency.', care: 'Call 911 immediately.', followUp: 'Is it severe enough that you cannot complete a sentence?' },
    'shortness of breath': { urgency: 'emergency', reason: 'Sudden shortness of breath may indicate a cardiac or pulmonary condition.', care: 'Seek emergency care immediately if severe.', followUp: 'Did this come on suddenly or gradually?' },
    'stroke': { urgency: 'emergency', reason: 'Stroke symptoms require immediate medical intervention.', care: 'Call 911 immediately. Time is critical — every minute counts.', followUp: null },
    'face drooping': { urgency: 'emergency', reason: 'Facial drooping is a classic stroke warning sign (FAST).', care: 'Call 911 immediately.', followUp: null },
    'unconscious': { urgency: 'emergency', reason: 'Loss of consciousness is always a medical emergency.', care: 'Call 911 immediately.', followUp: null },
    'severe bleeding': { urgency: 'emergency', reason: 'Uncontrolled bleeding requires immediate medical attention.', care: 'Call 911 or go to the ER. Apply pressure to the wound.', followUp: null },
    'seizure': { urgency: 'emergency', reason: 'Seizures, especially first-time or prolonged ones, require emergency evaluation.', care: 'Call 911. Do not restrain the person. Clear the area of hazards.', followUp: 'Is this a first-time seizure or do they have epilepsy?' },
    'severe allergic': { urgency: 'emergency', reason: 'Anaphylaxis is life-threatening and requires immediate epinephrine treatment.', care: 'Use an EpiPen if available and call 911 immediately.', followUp: null },
    'anaphylaxis': { urgency: 'emergency', reason: 'Anaphylaxis is a severe, life-threatening allergic reaction.', care: 'Use an EpiPen if available and call 911 immediately.', followUp: null },

    // URGENT
    'high fever': { urgency: 'urgent', reason: 'A fever above 103°F (39.4°C) in adults requires prompt medical evaluation.', care: 'Visit an urgent care center or your doctor today.', followUp: 'How high is the fever and how long have you had it?' },
    'fever': { urgency: 'urgent', reason: 'Fever may indicate infection or other conditions that need evaluation.', care: 'Visit urgent care if fever exceeds 103°F or has lasted more than 3 days.', followUp: 'What is your temperature and how many days have you had it?' },
    'broken bone': { urgency: 'urgent', reason: 'A suspected fracture needs X-ray imaging and immobilization.', care: 'Go to urgent care or the ER. Do not use the limb.', followUp: 'Can you move the affected area?' },
    'fracture': { urgency: 'urgent', reason: 'A suspected fracture needs X-ray imaging and proper treatment.', care: 'Visit urgent care or the ER promptly.', followUp: null },
    'severe headache': { urgency: 'urgent', reason: 'A sudden, severe "thunderclap" headache can indicate a brain bleed.', care: 'Seek emergency care if sudden and worst of your life. Otherwise, visit urgent care today.', followUp: 'Was the onset sudden or gradual?' },
    'migraine': { urgency: 'urgent', reason: 'Severe migraines can be debilitating and may need prescription medication.', care: 'Visit urgent care or your doctor if over-the-counter treatments are not working.', followUp: 'Do you have a history of migraines?' },
    'ear infection': { urgency: 'urgent', reason: 'Ear infections often require antibiotic treatment.', care: 'Visit urgent care or your doctor within 1–2 days.', followUp: 'Is there pain, discharge, or hearing loss?' },
    'urinary tract infection': { urgency: 'urgent', reason: 'UTIs need antibiotic treatment to prevent spreading to the kidneys.', care: 'See a doctor today or use a telehealth service for a prescription.', followUp: 'Do you have burning, frequency, or blood in urine?' },
    'uti': { urgency: 'urgent', reason: 'Urinary tract infections need prompt antibiotic treatment.', care: 'See a doctor today.', followUp: null },
    'vomiting': { urgency: 'urgent', reason: 'Persistent vomiting can lead to dehydration and may indicate an underlying issue.', care: 'Visit urgent care if vomiting lasts more than 24 hours or you cannot keep fluids down.', followUp: 'How long has this been going on?' },
    'dehydration': { urgency: 'urgent', reason: 'Severe dehydration needs IV fluids and medical monitoring.', care: 'Go to urgent care or the ER if you cannot keep fluids down.', followUp: null },
    'sprain': { urgency: 'urgent', reason: 'Sprains need to be evaluated to rule out fractures.', care: 'Visit urgent care within 24 hours. Use RICE (Rest, Ice, Compression, Elevation).', followUp: null },
    'cut': { urgency: 'urgent', reason: 'Deep cuts may need stitches to heal properly.', care: 'Visit urgent care. If bleeding is severe, go to the ER.', followUp: 'Is it deep or gaping?' },
    'allergic reaction': { urgency: 'urgent', reason: 'Allergic reactions can escalate quickly.', care: 'Take antihistamine if mild. Go to the ER immediately if breathing is affected.', followUp: 'Is there throat swelling or trouble breathing?' },
    'burn': { urgency: 'urgent', reason: 'Burns need assessment to determine depth and infection risk.', care: 'Minor burns: cool water and bandage. Larger/deeper burns: urgent care or ER.', followUp: 'How large is the burn area?' },

    // ROUTINE
    'cold': { urgency: 'routine', reason: 'Common colds are viral and typically resolve on their own in 7–10 days.', care: 'Rest, stay hydrated, and use over-the-counter remedies for symptom relief. Schedule a routine appointment if symptoms persist beyond 10 days.', followUp: 'How many days have you had symptoms?' },
    'cough': { urgency: 'routine', reason: 'Most coughs are caused by viral infections and resolve without treatment.', care: 'If cough persists more than 3 weeks, produces blood, or is accompanied by fever, see a doctor.', followUp: 'Is the cough dry or productive? Any fever?' },
    'sore throat': { urgency: 'routine', reason: 'Most sore throats are viral, but strep throat needs antibiotic treatment.', care: 'Schedule a routine appointment for a strep test if severe. Gargle with warm salt water in the meantime.', followUp: 'Is it very painful or accompanied by white spots on tonsils?' },
    'runny nose': { urgency: 'routine', reason: 'Runny nose is usually due to a cold, allergies, or sinusitis.', care: 'Use over-the-counter antihistamines or decongestants. See a doctor if symptoms last more than 10 days.', followUp: null },
    'back pain': { urgency: 'routine', reason: 'Most back pain is musculoskeletal and improves with rest and physical therapy.', care: 'Schedule a routine appointment. Use OTC pain relievers. Seek urgent care if you have numbness or bladder/bowel changes.', followUp: 'Is there any numbness, tingling, or weakness in your legs?' },
    'rash': { urgency: 'routine', reason: 'Most rashes are contact dermatitis or mild allergic reactions.', care: 'Apply hydrocortisone cream for mild rashes. See a doctor if spreading rapidly or accompanied by fever.', followUp: 'Is the rash spreading or accompanied by fever?' },
    'insomnia': { urgency: 'routine', reason: 'Chronic insomnia may need behavioral or medical treatment.', care: 'Practice good sleep hygiene. Schedule a routine appointment if it persists more than a month.', followUp: null },
    'anxiety': { urgency: 'routine', reason: 'Anxiety is a common condition with effective treatments available.', care: 'Schedule a routine appointment with a mental health professional or your PCP.', followUp: null },
    'fatigue': { urgency: 'routine', reason: 'Persistent fatigue can have many causes, including anemia, thyroid issues, or depression.', care: 'Schedule a routine appointment for blood work and evaluation if fatigue persists more than 2 weeks.', followUp: 'How long have you been feeling fatigued?' },
    'stomach ache': { urgency: 'routine', reason: 'Mild stomach aches are common and often resolve on their own.', care: 'Rest, avoid solid foods briefly, and stay hydrated. See a doctor if severe or persistent.', followUp: 'Is the pain localized or general? Any nausea or fever?' },
    'headache': { urgency: 'routine', reason: 'Tension headaches are very common and typically manageable with OTC medication.', care: 'Take OTC pain relievers, rest, and stay hydrated. See a doctor if headaches are frequent or worsening.', followUp: 'How long has the headache lasted and how severe is it (1–10)?' },
    'constipation': { urgency: 'routine', reason: 'Most constipation resolves with dietary changes and hydration.', care: 'Increase fiber and fluid intake. Use OTC laxatives if needed. See a doctor if severe or accompanied by blood.', followUp: null },
    'acne': { urgency: 'routine', reason: 'Acne is common and treatable by dermatologists.', care: 'Schedule a routine dermatology appointment for persistent or severe acne.', followUp: null },
  };

  function detectSymptom(text) {
    const t = text.toLowerCase();
    for (const [symptom, data] of Object.entries(symptomDB)) {
      if (t.includes(symptom)) return { symptom, ...data };
    }
    return null;
  }

  function addMessage(text, type = 'ai') {
    const history = document.getElementById('symptom-history');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;
    if (type === 'ai') {
      bubble.innerHTML = `<div class="ai-label">🩺 MedEasy Triage</div>${text}`;
    } else {
      bubble.textContent = text;
    }
    history.appendChild(bubble);
    history.scrollTop = history.scrollHeight;
  }

  function showResult(data) {
    const urgencyColors = { emergency: 'red', urgent: 'orange', routine: 'green' };
    const urgencyEmojis = { emergency: '🚨', urgent: '⚠️', routine: '✅' };
    const urgencyLabels = { emergency: 'EMERGENCY', urgent: 'URGENT', routine: 'ROUTINE' };

    const resultPanel = document.getElementById('triage-result-panel');
    resultPanel.className = `triage-result ${data.urgency}`;
    resultPanel.innerHTML = `
      <div class="triage-level">${urgencyEmojis[data.urgency]} ${urgencyLabels[data.urgency]}</div>
      <div style="font-size:0.88rem;color:var(--text-2);line-height:1.7;margin-bottom:12px;"><strong>Why:</strong> ${data.reason}</div>
      <div style="font-size:0.88rem;color:var(--text-2);line-height:1.7;margin-bottom:16px;"><strong>Recommended Action:</strong> ${data.care}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${data.urgency === 'emergency' ? '' : `<button class="btn btn-primary btn-sm" onclick="Router.go('booking')">📅 Book Appointment</button>`}
        <button class="btn btn-outline btn-sm" onclick="Router.go('hospitals')">🏥 Find Hospital</button>
        <button class="btn btn-ghost btn-sm" onclick="TriageEngine.reset()">🔄 Start Over</button>
      </div>
    `;
    resultPanel.style.display = 'block';

    const speakText = `${urgencyLabels[data.urgency]} level. ${data.reason} ${data.care}`;
    VoiceEngine.speak(speakText);
  }

  function handleInput(input) {
    if (!input.trim()) return;

    addMessage(input, 'user');

    // Handle follow-up
    if (followUpPending && (input.toLowerCase().includes('yes') || input.toLowerCase().includes('no') || input.toLowerCase().includes('day') || input.toLowerCase().includes('hour'))) {
      addMessage(`Thank you. Based on all symptoms described, here is your triage assessment:`, 'ai');
      const lastSymptom = symptoms[symptoms.length - 1];
      const data = detectSymptom(lastSymptom) || detectSymptom(symptoms.join(' '));
      if (data) showResult(data);
      followUpPending = null;
      return;
    }

    const detected = detectSymptom(input);

    if (detected) {
      symptoms.push(detected.symptom);
      const followUpText = detected.followUp ? `<br><br><em style="color:var(--teal)">${detected.followUp}</em>` : '';

      if (detected.urgency === 'emergency') {
        addMessage(`I've detected a potentially serious symptom: <strong style="color:var(--red)">${detected.symptom}</strong>. Generating emergency triage now...`, 'ai');
        setTimeout(() => showResult(detected), 600);
      } else {
        addMessage(`I've noted: <strong style="color:var(--teal)">${detected.symptom}</strong>. Do you have any other symptoms, or should I assess this now?${followUpText}`, 'ai');
        if (detected.followUp) followUpPending = detected;
      }
    } else {
      const clarifying = [
        'Could you describe your main symptom more specifically? For example: "chest pain", "fever", "headache", "sore throat".',
        'I didn\'t catch a specific symptom there. Can you tell me what hurts or what you\'re experiencing?',
        'Let me help you better — what is your primary complaint? (e.g. cough, rash, back pain, nausea)',
      ];
      addMessage(clarifying[Math.floor(Math.random() * clarifying.length)], 'ai');
    }

    document.getElementById('symptom-input').value = '';
  }

  function assess() {
    if (!symptoms.length) {
      addMessage('Please describe at least one symptom first, and I will assess it for you.', 'ai');
      return;
    }
    const allText = symptoms.join(' ');
    const data = detectSymptom(allText) || detectSymptom(symptoms[0]);
    if (data) {
      addMessage(`Based on the symptoms you described, here is your triage assessment:`, 'ai');
      setTimeout(() => showResult(data), 400);
    }
  }

  function reset() {
    symptoms = [];
    followUpPending = null;
    document.getElementById('symptom-history').innerHTML = '';
    document.getElementById('triage-result-panel').style.display = 'none';
    conversationState = 'initial';
    setTimeout(() => {
      addMessage('Triage reset. Please describe your symptoms again, or select a common symptom on the right to get started.', 'ai');
    }, 100);
  }

  function init() {
    const input = document.getElementById('symptom-input');
    document.getElementById('symptom-send-btn').addEventListener('click', () => {
      if (input.value.trim()) { handleInput(input.value.trim()); input.value = ''; }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) { handleInput(input.value.trim()); input.value = ''; }
    });

    document.getElementById('symptom-voice-btn').addEventListener('click', () => {
      VoiceEngine.listen(t => handleInput(t));
    });

    document.getElementById('symptom-assess-btn').addEventListener('click', assess);
    document.getElementById('symptom-reset-btn').addEventListener('click', reset);

    document.querySelectorAll('.symptom-example-btn').forEach(btn => {
      btn.addEventListener('click', () => handleInput(btn.dataset.symptom));
    });

    document.querySelectorAll('.triage-chip').forEach(chip => {
      chip.addEventListener('click', () => handleInput(chip.textContent.trim()));
    });

    // Welcome
    setTimeout(() => {
      addMessage('👋 Hello! I\'m MedEasy\'s triage assistant. Describe your symptoms — by text or voice — and I\'ll assess the urgency of care you need. You can say things like "I have chest pain", "I have a fever", or "my back hurts".', 'ai');
    }, 400);
  }

  return { init, handleInput, reset };
})();

window.TriageEngine = TriageEngine;
window.Router = Router;


/* ================================================================
   INIT — Start everything
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  Router.go('insurance');
  InsuranceEngine.init();
  HospitalEngine.init();
  BookingEngine.init();
  TriageEngine.init();
});
