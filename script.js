const SUPABASE_URL = "https://icjympnpespxfsbqzhdf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wLK_1rJskX_8TK_swj5B8A_QtMu57zq";

const MAX_TEAMS = 30;
const EVENT_DATE = '2026-09-15T09:30:00+05:30';
const supabaseReady = SUPABASE_URL.startsWith('http') && !SUPABASE_URL.includes('PASTE_') && !SUPABASE_ANON_KEY.includes('PASTE_');
const client = supabaseReady && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const registrationForm = document.querySelector('#registrationForm');
const lookupForm = document.querySelector('#lookupForm');
const modal = document.querySelector('#successModal');

function updateCountdown() {
  const distance = Math.max(0, new Date(EVENT_DATE).getTime() - Date.now());
  const values = { days: Math.floor(distance / 86400000), hours: Math.floor(distance % 86400000 / 3600000), minutes: Math.floor(distance % 3600000 / 60000), seconds: Math.floor(distance % 60000 / 1000) };
  Object.entries(values).forEach(([unit, value]) => { document.querySelector(`[data-unit="${unit}"]`).textContent = String(value).padStart(2, '0'); });
}

function showError(field, message) {
  const wrapper = field.closest('.form-field') || field.closest('.agreement');
  if (!wrapper) return;
  wrapper.classList.toggle('invalid', Boolean(message));
  wrapper.querySelector('.error-message')?.replaceChildren(document.createTextNode(message));
}

function getFormData() {
  return Object.fromEntries(new FormData(registrationForm).entries());
}

function safe(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character])); }

function openModal(teamId) {
  const teamIdTarget = document.querySelector('#successTeamId');
  if (teamIdTarget) teamIdTarget.textContent = teamId;
  modal.hidden = false;
  document.querySelector('#modalClose').focus();
}

function closeModal() { modal.hidden = true; }

async function refreshCapacity() {
  const countLabel = document.querySelector('#registrationCount');
  const fill = document.querySelector('#capacityFill');
  if (!client) { countLabel.textContent = `0 / ${MAX_TEAMS} Teams Registered`; return; }
  const { data, error } = await client.rpc('get_registration_count');
  if (error) { countLabel.textContent = 'Capacity unavailable'; return; }
  const total = Number(data) || 0;
  countLabel.textContent = `${total} / ${MAX_TEAMS} Teams Registered`;
  fill.style.width = `${Math.min(100, total / MAX_TEAMS * 100)}%`;
  if (total >= MAX_TEAMS) {
    registrationForm.classList.add('closed');
    registrationForm.querySelectorAll('input, button').forEach((field) => { field.disabled = true; });
    document.querySelector('#registrationClosed').hidden = false;
  }
}

window.addEventListener('load', () => setTimeout(() => document.querySelector('#loader')?.classList.add('hide'), 550));
setInterval(updateCountdown, 1000); updateCountdown();

const heroMenuToggle = document.querySelector('#heroMenuToggle');
const heroMenuPanel = document.querySelector('#heroMenuPanel');
heroMenuToggle.addEventListener('click', () => {
  const open = !heroMenuPanel.hidden;
  heroMenuPanel.hidden = open;
  heroMenuToggle.setAttribute('aria-expanded', String(!open));
  heroMenuToggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
});
heroMenuPanel.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  heroMenuPanel.hidden = true;
  heroMenuToggle.setAttribute('aria-expanded', 'false');
  heroMenuToggle.setAttribute('aria-label', 'Open menu');
}));
document.querySelectorAll('.round-toggle').forEach((button) => button.addEventListener('click', () => {
  const card = button.closest('.round-card'); card.classList.toggle('open'); button.setAttribute('aria-expanded', String(card.classList.contains('open')));
}));

const closedNotice = document.querySelector('#registrationClosed') || Object.assign(document.createElement('p'), { id: 'registrationClosed', textContent: 'REGISTRATIONS CLOSED / All 30 team slots have been filled.' });
closedNotice.hidden = true;
closedNotice.className = 'registration-closed';
registrationForm.append(closedNotice);
const setupNotice = document.querySelector('#setupNotice') || Object.assign(document.createElement('p'), { id: 'setupNotice', textContent: 'Add your Supabase URL and publishable key in script.js to enable live registration.' });
setupNotice.hidden = true;
setupNotice.className = 'registration-closed';
registrationForm.append(setupNotice);
refreshCapacity();
registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = registrationForm.querySelector('button[type="submit"]');
  if (!client) { document.querySelector('#setupNotice').hidden = false; return; }
  let valid = true;
  registrationForm.querySelectorAll('input[required]').forEach((field) => {
    let message = field.value.trim() ? '' : 'This field is required.';
    if (field.id === 'phone' && field.value && !/^\d{10}$/.test(field.value.replace(/\D/g, ''))) message = 'Enter a valid 10-digit Indian phone number.';
    if (field.type === 'email' && field.value && !/^\S+@\S+\.\S+$/.test(field.value)) message = 'Enter a valid email address.';
    if (field.type === 'checkbox' && !field.checked) message = 'Please accept the competition rules.';
    showError(field, message); if (message) valid = false;
  });
  if (!valid) return;
  const values = getFormData();
  if (submitButton?.disabled) return;
  if (submitButton) { submitButton.disabled = true; submitButton.dataset.originalText = submitButton.innerHTML; submitButton.textContent = 'Submitting...'; }
  try {
    const { data, error } = await client.rpc('register_team', {
      p_team_name: values.team_name, p_captain_name: values.captain_name,
      p_captain_phone: values.captain_phone, p_captain_email: values.captain_email,
      p_department: values.department, p_branch_semester: values.branch_semester,
      p_member_2: values.member_2, p_member_3: values.member_3, p_member_4: values.member_4
    });
    if (error) throw error;
    const team_id = Array.isArray(data) ? data[0]?.team_id : data?.team_id;
    if (!team_id) throw new Error('Registration was not confirmed by the database.');
    registrationForm.reset(); await refreshCapacity(); openModal(team_id);
  } catch (error) {
    setupNotice.textContent = error.message.includes('already registered') ? error.message : error.message === 'FULL' ? 'REGISTRATIONS CLOSED / All 30 team slots have been filled.' : `Could not complete registration. ${error.message}`;
    setupNotice.hidden = false;
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = submitButton.dataset.originalText || 'Create registration'; }
  }
});

lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = document.querySelector('#lookupResult');
  const lookupButton = lookupForm.querySelector('button[type="submit"]');
  if (!client) { result.textContent = 'Add your Supabase keys in script.js to enable lookup.'; return; }
  if (lookupButton?.disabled) return;
  const values = Object.fromEntries(new FormData(lookupForm).entries());
  if (lookupButton) { lookupButton.disabled = true; lookupButton.dataset.originalText = lookupButton.innerHTML; lookupButton.textContent = 'Checking...'; }
  try {
    const { data, error } = await client.rpc('lookup_registration', { p_team_id: values.team_id, p_captain_email: values.captain_email });
    const registration = Array.isArray(data) ? data[0] : data;
    result.innerHTML = error || !registration ? '<b>No matching registration found.</b>' : `<b>${safe(registration.team_id)} / ${safe(registration.team_name)}</b><span>Captain: ${safe(registration.captain_name)}</span><span>${safe(registration.department)} / ${safe(registration.branch_semester)}</span><span>Members: ${safe(registration.member_2)}, ${safe(registration.member_3)}, ${safe(registration.member_4)}</span>`;
  } finally {
    if (lookupButton) { lookupButton.disabled = false; lookupButton.innerHTML = lookupButton.dataset.originalText || 'Check registration'; }
  }
});

document.querySelector('#modalClose').addEventListener('click', closeModal); document.querySelector('#modalAction').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
