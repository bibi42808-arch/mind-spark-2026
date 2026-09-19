const SUPABASE_URL = "https://icjympnpespxfsbqzhdf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wLK_1rJskX_8TK_swj5B8A_QtMu57zq";
const MAX_TEAMS = 30;
const supabaseReady = SUPABASE_URL.startsWith('http') && !SUPABASE_URL.includes('PASTE_') && !SUPABASE_ANON_KEY.includes('PASTE_');
const client = supabaseReady && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let registrations = [];
let departmentFilter = '';
const columns = ['team_id', 'team_name', 'captain_name', 'captain_phone', 'captain_email', 'department', 'branch_semester', 'member_2', 'member_3', 'member_4', 'created_at'];

function safe(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character])); }
function renderTable() {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  const rows = registrations.filter((registration) => columns.some((column) => String(registration[column] ?? '').toLowerCase().includes(query)) && (!departmentFilter || registration.department === departmentFilter));
  document.querySelector('#totalCount').textContent = registrations.length;
  document.querySelector('#remainingCount').textContent = Math.max(0, MAX_TEAMS - registrations.length);
  document.querySelector('#registrationsTable tbody').innerHTML = rows.length ? rows.map((registration) => `<tr><td><button class="remove-registration" type="button" data-team-id="${safe(registration.team_id)}">Remove</button></td>${columns.map((column) => `<td>${safe(column === 'created_at' ? new Date(registration[column]).toLocaleString('en-IN') : registration[column])}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="12">No matching registrations.</td></tr>';
}

async function loadRegistrations() {
  if (!client) { document.querySelector('#adminStatus').textContent = 'ADD SUPABASE KEYS'; document.querySelector('#registrationsTable tbody').innerHTML = '<tr><td colspan="12">Paste the Supabase URL and publishable key in admin.js.</td></tr>'; return; }
  document.querySelector('#adminStatus').textContent = 'LOADING...';
  document.querySelector('#registrationsTable tbody').innerHTML = '<tr><td colspan="12">Loading registrations...</td></tr>';
  const { data, error } = await client.from('registrations').select(columns.join(',')).order('created_at', { ascending: false });
  if (error) { document.querySelector('#adminStatus').textContent = 'QUERY ERROR'; document.querySelector('#registrationsTable tbody').innerHTML = `<tr><td colspan="12">${safe(error.message)}</td></tr>`; return; }
  registrations = data || [];
  if (!registrations.length) {
    document.querySelector('#adminStatus').textContent = 'NO REGISTRATIONS';
    document.querySelector('#registrationsTable tbody').innerHTML = '<tr><td colspan="12">No registrations have been saved yet.</td></tr>';
    addAdminControls(); updateDepartmentFilter(); renderTable(); return;
  }
  document.querySelector('#adminStatus').textContent = 'LIVE / MANAGE';
  addAdminControls();
  updateDepartmentFilter();
  renderTable();
}

function addAdminControls() {
  const controls = document.querySelector('#search')?.closest('.form-row');
  if (!controls || document.querySelector('#refreshRegistrations')) return;
  const filter = document.createElement('select');
  filter.id = 'departmentFilter';
  filter.innerHTML = '<option value="">All departments</option>';
  filter.addEventListener('change', () => { departmentFilter = filter.value; renderTable(); });
  controls.insertBefore(filter, controls.querySelector('button'));
  const refresh = document.createElement('button');
  refresh.id = 'refreshRegistrations'; refresh.type = 'button'; refresh.className = 'submit-button'; refresh.textContent = 'Refresh';
  refresh.addEventListener('click', loadRegistrations);
  controls.insertBefore(refresh, controls.querySelector('button'));
  const excel = document.createElement('button');
  excel.id = 'exportExcel'; excel.type = 'button'; excel.className = 'submit-button'; excel.textContent = 'Export Excel';
  excel.addEventListener('click', exportExcel);
  controls.append(excel);
}

function updateDepartmentFilter() {
  const filter = document.querySelector('#departmentFilter');
  if (!filter) return;
  const selected = filter.value;
  filter.replaceChildren(new Option('All departments', ''));
  [...new Set(registrations.map((registration) => registration.department).filter(Boolean))].sort().forEach((department) => filter.add(new Option(department, department)));
  filter.value = selected;
}

async function exportCsv() {
  const button = document.querySelector('#exportCsv');
  if (!client || button?.disabled) return;
  if (button) { button.disabled = true; button.dataset.originalText = button.innerHTML; button.textContent = 'Preparing CSV...'; }
  try {
    const { data, error } = await client.from('registrations').select(columns.join(',')).order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) { document.querySelector('#adminStatus').textContent = 'NO DATA TO EXPORT'; return; }
    const csv = [columns.join(','), ...rows.map((registration) => columns.map((column) => `"${String(registration[column] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.href = objectUrl;
    link.download = 'mind-spark-registrations.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    document.querySelector('#adminStatus').textContent = `EXPORTED ${rows.length} TEAMS`;
  } catch (error) {
    document.querySelector('#adminStatus').textContent = `EXPORT ERROR: ${error.message}`;
  } finally {
    if (button) { button.disabled = false; button.innerHTML = button.dataset.originalText || 'Export CSV ↗'; }
  }
}

function exportExcel() {
  if (!registrations.length) return;
  const rows = [columns, ...registrations.map((registration) => columns.map((column) => String(registration[column] ?? '')))];
  const table = `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${safe(cell)}</td>`).join('')}</tr>`).join('')}</table>`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`<html><meta charset="utf-8"><body>${table}</body></html>`], { type: 'application/vnd.ms-excel' }));
  link.download = 'mind-spark-registrations.xls'; link.click(); URL.revokeObjectURL(link.href);
}

async function removeRegistration(teamId) {
  if (!client) return;
  document.querySelector('#adminStatus').textContent = 'REMOVING...';
  const { error } = await client.from('registrations').delete().eq('team_id', teamId);
  if (error) {
    document.querySelector('#adminStatus').textContent = `REMOVE ERROR: ${error.message}`;
    return;
  }
  await loadRegistrations();
}

document.querySelector('#search').addEventListener('input', renderTable);
document.querySelector('#exportCsv').addEventListener('click', exportCsv);
document.querySelector('#registrationsTable tbody').addEventListener('click', (event) => {
  const button = event.target.closest('.remove-registration');
  if (button && window.confirm(`Remove registration ${button.dataset.teamId}?`)) removeRegistration(button.dataset.teamId);
});

async function openDashboard() {
  document.querySelector('#adminLogin').hidden = true;
  document.querySelector('#adminDashboard').hidden = false;
  loadRegistrations();
}

document.querySelector('#adminLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.querySelector('#adminLoginError');
  const loginButton = event.currentTarget.querySelector('button[type="submit"]');
  if (!client) {
    error.textContent = 'Supabase is not configured.';
    return;
  }
  const email = document.querySelector('#adminEmail').value.trim();
  const password = document.querySelector('#adminPassword').value;
  if (loginButton?.disabled) return;
  if (loginButton) { loginButton.disabled = true; loginButton.dataset.originalText = loginButton.textContent; loginButton.textContent = 'Signing in...'; }
  try {
    const { error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError) {
      error.textContent = `${loginError.message} Use the email and password created in Supabase Authentication.`;
      document.querySelector('#adminPassword').select();
      return;
    }
    error.textContent = '';
    openDashboard();
  } finally {
    if (loginButton) { loginButton.disabled = false; loginButton.textContent = loginButton.dataset.originalText || 'Open dashboard'; }
  }
});

document.querySelector('#adminLogout').addEventListener('click', async () => {
  await client?.auth.signOut();
  document.querySelector('#adminDashboard').hidden = true;
  document.querySelector('#adminLogin').hidden = false;
  document.querySelector('#adminPassword').value = '';
});

async function restoreAuthSession() {
  if (!client) return;
  if (new URLSearchParams(window.location.search).has('login')) {
    await client.auth.signOut();
    return;
  }
  const { data } = await client.auth.getSession();
  if (data.session) openDashboard();
}

restoreAuthSession();
