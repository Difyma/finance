import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEY = "finance_app_data";
const API_URL = "/api/finance-data";
const AUTH_URL = "/api/auth";

async function getAuthStatus() {
  try {
    const response = await fetch(AUTH_URL);
    if (response.status === 503) return { authed: true, local: true };
    if (!response.ok) return { authed: false };
    return await response.json();
  } catch {
    return { authed: true, local: true };
  }
}

async function loginWithPassword(password) {
  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error(response.status === 503 ? "AUTH_NOT_CONFIGURED" : "INVALID_PASSWORD");
  }
}

async function logoutSession() {
  try {
    await fetch(AUTH_URL, { method: "DELETE" });
  } catch {
    // Local Vite dev has no auth API.
  }
}

async function loadData() {
  try {
    const response = await fetch(API_URL);
    if (response.ok) return await response.json();
  } catch {
    // Local Vite dev does not serve Vercel Functions; fall back to browser storage.
  }

  try {
    if (window.storage?.get) {
      const result = await window.storage.get(STORAGE_KEY);
      return result ? JSON.parse(result.value) : null;
    }

    const result = window.localStorage.getItem(STORAGE_KEY);
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

async function saveData(data) {
  try {
    const response = await fetch(API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.ok) return;
  } catch {
    // Local Vite dev does not serve Vercel Functions; fall back to browser storage.
  }

  try {
    const value = JSON.stringify(data);
    if (window.storage?.set) await window.storage.set(STORAGE_KEY, value);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch (e) { console.error("Save error", e); }
}

// ─── Default state ────────────────────────────────────────────────────────────
const OBLIGATORY = [
  { id: "mortgage",  label: "🏠 Ипотека",           plan: 48000,  day: "3-е число",    note: "Каждый месяц" },
  { id: "car_loan",  label: "🚗 Автокредит",         plan: 58000,  day: "26-е число",   note: "Каждый месяц" },
  { id: "parking",   label: "🅿️ Паркинг",            plan: 20000,  day: "По договору",  note: "Аренда" },
  { id: "fuel",      label: "⛽ Бензин",              plan: 16000,  day: "По факту",     note: "~4 000₽/нед" },
  { id: "service",   label: "🔧 ТО (резерв)",         plan: 18333,  day: "Раз в 3 мес", note: "ТО ≈55 000₽" },
  { id: "utility",   label: "🏘️ Коммунальные",        plan: 10500,  day: "По квитанции", note: "9–12 тыс" },
  { id: "mobile",    label: "📱 Сотовая связь",       plan: 2000,   day: "По договору",  note: "Ежемесячно" },
  { id: "haircut",   label: "✂️ Стрижка",             plan: 10400,  day: "2 раза/мес",   note: "5 200₽ × 2" },
];

const VARIABLE = [
  { id: "groceries",     label: "🛒 Продукты",        plan: 30000, cat: "Питание" },
  { id: "cafe",          label: "🍽️ Кафе/Рестораны",  plan: 15000, cat: "Питание" },
  { id: "clothes",       label: "👕 Одежда/Обувь",    plan: 10000, cat: "Личное" },
  { id: "health",        label: "💊 Здоровье/Аптека", plan: 5000,  cat: "Здоровье" },
  { id: "fitness",       label: "🏋️ Фитнес",          plan: 5000,  cat: "Здоровье" },
  { id: "entertainment", label: "🎭 Досуг",            plan: 8000,  cat: "Отдых" },
  { id: "education",     label: "📚 Образование",      plan: 3000,  cat: "Развитие" },
  { id: "gifts",         label: "🎁 Подарки",          plan: 5000,  cat: "Прочее" },
  { id: "travel",        label: "✈️ Путешествия",      plan: 10000, cat: "Отдых" },
  { id: "home",          label: "🏠 Дом/Быт",         plan: 5000,  cat: "Дом" },
  { id: "subscriptions", label: "💻 Подписки",         plan: 2000,  cat: "Прочее" },
];

const RESERVE = [
  { id: "legal",     label: "⚖️ Юридические/Суды",  plan: 15000 },
  { id: "notary",    label: "📄 Нотариус/Документы", plan: 5000 },
  { id: "emergency", label: "🔧 Аварийный ремонт",   plan: 20000 },
  { id: "medical",   label: "🏥 Медицина (экстренная)", plan: 15000 },
  { id: "other_res", label: "📦 Прочий форс-мажор",  plan: 10000 },
];

const MONTHS_RU = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

const defaultMonthData = () => ({
  income: 0,
  obligatory: Object.fromEntries(OBLIGATORY.map(i => [i.id, { fact: 0, paid: false }])),
  variable: Object.fromEntries(VARIABLE.map(i => [i.id, 0])),
  reserve: Object.fromEntries(RESERVE.map(i => [i.id, 0])),
  expenses: [],
});

const mkKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

function normalizeMonthData(month = {}) {
  const defaults = defaultMonthData();
  const obligatory = { ...defaults.obligatory, ...(month.obligatory || {}) };

  for (const item of OBLIGATORY) {
    const entry = obligatory[item.id] || {};
    obligatory[item.id] = {
      fact: entry.paid && !Number(entry.fact) ? item.plan : Number(entry.fact || 0),
      paid: !!entry.paid,
    };
  }

  return {
    ...defaults,
    ...month,
    obligatory,
    variable: { ...defaults.variable, ...(month.variable || {}) },
    reserve: { ...defaults.reserve, ...(month.reserve || {}) },
    expenses: month.expenses || [],
  };
}

function normalizeData(data) {
  const months = Object.fromEntries(
    Object.entries(data?.months || {}).map(([key, month]) => [key, normalizeMonthData(month)])
  );

  return {
    months,
    loans: data?.loans || [],
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0a0f1e",
  surface: "#111827",
  card: "#141d2e",
  border: "#1e2d45",
  accent: "#3b82f6",
  accentGlow: "#3b82f620",
  green: "#10b981",
  red: "#ef4444",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  text: "#f1f5f9",
  muted: "#64748b",
  danger: "#7f1d1d",
};

const PIE_COLORS = ["#3b82f6", "#ef4444", "#8b5cf6", "#10b981"];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0a0f1e;
    color: #f1f5f9;
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
    overflow-x: hidden;
  }

  button, input, select { font: inherit; }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #0a0f1e; }
  ::-webkit-scrollbar-thumb { background: #1e2d45; border-radius: 4px; }

  .app { min-height: 100vh; background: #0a0f1e; }

  /* Auth */
  .auth-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at 30% 50%, #1e3a5f22 0%, transparent 60%),
                radial-gradient(ellipse at 70% 20%, #3b82f611 0%, transparent 50%),
                #0a0f1e;
  }
  .auth-card {
    background: #111827;
    border: 1px solid #1e2d45;
    border-radius: 20px;
    padding: 48px 40px;
    width: 380px;
    box-shadow: 0 0 80px #3b82f610, 0 24px 48px #00000060;
  }
  .auth-logo {
    font-family: 'Syne', sans-serif;
    font-size: 28px;
    font-weight: 800;
    color: #f1f5f9;
    margin-bottom: 6px;
    letter-spacing: -1px;
  }
  .auth-logo span { color: #3b82f6; }
  .auth-sub { color: #64748b; font-size: 14px; margin-bottom: 36px; }
  .auth-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; display: block; }
  .auth-input {
    width: 100%;
    background: #0a0f1e;
    border: 1px solid #1e2d45;
    border-radius: 10px;
    color: #f1f5f9;
    font-size: 15px;
    padding: 12px 16px;
    outline: none;
    transition: border-color .2s;
    font-family: 'DM Sans', sans-serif;
  }
  .auth-input:focus { border-color: #3b82f6; }
  .auth-btn {
    width: 100%;
    margin-top: 24px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 14px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    letter-spacing: .5px;
    transition: background .2s, transform .1s;
  }
  .auth-btn:hover { background: #2563eb; transform: translateY(-1px); }
  .auth-err { color: #ef4444; font-size: 13px; margin-top: 10px; text-align: center; }
  .auth-hint { color: #1e2d45; font-size: 11px; margin-top: 16px; text-align: center; }

  /* Layout */
  .layout { display: flex; min-height: 100vh; }

  .sidebar {
    width: 220px;
    background: #111827;
    border-right: 1px solid #1e2d45;
    display: flex;
    flex-direction: column;
    padding: 24px 0;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 10;
  }
  .sidebar-logo {
    font-family: 'Syne', sans-serif;
    font-size: 18px;
    font-weight: 800;
    color: #f1f5f9;
    padding: 0 20px 24px;
    letter-spacing: -0.5px;
    border-bottom: 1px solid #1e2d45;
    margin-bottom: 16px;
  }
  .sidebar-logo span { color: #3b82f6; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    font-size: 14px;
    color: #64748b;
    cursor: pointer;
    transition: all .2s;
    border-left: 2px solid transparent;
    font-weight: 500;
  }
  .nav-item:hover { color: #f1f5f9; background: #141d2e; }
  .nav-item.active { color: #3b82f6; border-left-color: #3b82f6; background: #3b82f608; }
  .nav-icon { font-size: 16px; width: 20px; text-align: center; }

  .sidebar-bottom {
    margin-top: auto;
    padding: 16px 20px;
    border-top: 1px solid #1e2d45;
  }
  .month-selector {
    background: #0a0f1e;
    border: 1px solid #1e2d45;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 13px;
    padding: 8px 10px;
    width: 100%;
    outline: none;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
  }
  .logout-btn {
    width: 100%;
    margin-top: 8px;
    background: transparent;
    border: 1px solid #1e2d45;
    border-radius: 8px;
    color: #64748b;
    font-size: 12px;
    padding: 8px;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
    transition: all .2s;
  }
  .logout-btn:hover { border-color: #ef4444; color: #ef4444; }

  .main { margin-left: 220px; padding: 32px; flex: 1; }

  .mobile-period-bar {
    display: none;
    position: sticky;
    top: 0;
    z-index: 15;
    background: #0a0f1ef2;
    border-bottom: 1px solid #1e2d45;
    margin: -16px -16px 20px;
    padding: 12px 16px;
    backdrop-filter: blur(12px);
  }
  .mobile-period-title {
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  .mobile-period-row {
    display: block;
    align-items: center;
  }

  .mobile-nav {
    display: none;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    background: #111827f2;
    border-top: 1px solid #1e2d45;
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
    overflow-x: auto;
  }
  .mobile-nav-item {
    min-width: 72px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: #64748b;
    padding: 7px 8px;
    font-family: 'DM Sans', sans-serif;
    font-size: 11px;
    cursor: pointer;
  }
  .mobile-nav-item.active {
    color: #3b82f6;
    background: #3b82f610;
    border-color: #3b82f630;
  }
  .mobile-nav-icon {
    display: block;
    font-size: 16px;
    margin-bottom: 2px;
  }

  .page-title {
    font-family: 'Syne', sans-serif;
    font-size: 26px;
    font-weight: 800;
    color: #f1f5f9;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }
  .page-sub { color: #64748b; font-size: 14px; margin-bottom: 28px; }

  /* Cards */
  .card {
    background: #141d2e;
    border: 1px solid #1e2d45;
    border-radius: 16px;
    padding: 20px;
  }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

  /* KPI tiles */
  .kpi {
    background: #141d2e;
    border: 1px solid #1e2d45;
    border-radius: 16px;
    padding: 20px 22px;
    position: relative;
    overflow: hidden;
  }
  .kpi::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
  }
  .kpi.blue::before { background: #3b82f6; }
  .kpi.green::before { background: #10b981; }
  .kpi.red::before { background: #ef4444; }
  .kpi.amber::before { background: #f59e0b; }
  .kpi.purple::before { background: #8b5cf6; }

  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 600; margin-bottom: 10px; }
  .kpi-value { font-family: 'Syne', sans-serif; font-size: 24px; font-weight: 800; color: #f1f5f9; letter-spacing: -1px; }
  .kpi-value.green { color: #10b981; }
  .kpi-value.red { color: #ef4444; }
  .kpi-value.amber { color: #f59e0b; }
  .kpi-sub { font-size: 12px; color: #64748b; margin-top: 4px; }

  /* Progress bar */
  .prog-wrap { margin: 6px 0; }
  .prog-bar-bg { background: #0a0f1e; border-radius: 99px; height: 5px; overflow: hidden; }
  .prog-bar { height: 100%; border-radius: 99px; transition: width .5s ease; }

  /* Tables */
  .tbl { width: 100%; border-collapse: collapse; }
  .tbl th {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #64748b;
    font-weight: 600;
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid #1e2d45;
  }
  .tbl td {
    padding: 10px 12px;
    font-size: 14px;
    border-bottom: 1px solid #0a0f1e;
    vertical-align: middle;
  }
  .tbl tr:hover td { background: #1e2d4520; }
  .tbl .num { text-align: right; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; }

  /* Inputs */
  .inp {
    background: #0a0f1e;
    border: 1px solid #1e2d45;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 14px;
    padding: 8px 12px;
    outline: none;
    font-family: 'DM Sans', sans-serif;
    width: 120px;
    text-align: right;
    transition: border-color .2s;
  }
  .inp:focus { border-color: #3b82f6; }
  .inp-wide { width: 100%; }
  .inp-sm { width: 80px; }

  /* Checkbox */
  .check-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .check-box {
    width: 18px; height: 18px;
    border: 2px solid #1e2d45;
    border-radius: 5px;
    background: #0a0f1e;
    display: flex; align-items: center; justify-content: center;
    transition: all .2s; flex-shrink: 0;
    cursor: pointer;
  }
  .check-box.checked { background: #10b981; border-color: #10b981; }
  .check-tick { color: white; font-size: 11px; font-weight: 700; }

  /* Badge */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge-green { background: #10b98120; color: #10b981; }
  .badge-red { background: #ef444420; color: #ef4444; }
  .badge-amber { background: #f59e0b20; color: #f59e0b; }
  .badge-blue { background: #3b82f620; color: #3b82f6; }
  .badge-purple { background: #8b5cf620; color: #8b5cf6; }

  /* Section headers */
  .sec-hdr {
    font-family: 'Syne', sans-serif;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #64748b;
    margin-bottom: 14px;
    margin-top: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sec-hdr::after { content: ''; flex: 1; height: 1px; background: #1e2d45; }

  /* Buttons */
  .btn {
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    transition: background .2s, transform .1s;
  }
  .btn:hover { background: #2563eb; transform: translateY(-1px); }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn-ghost {
    background: transparent;
    border: 1px solid #1e2d45;
    color: #64748b;
  }
  .btn-ghost:hover { border-color: #3b82f6; color: #3b82f6; background: #3b82f608; }
  .btn-danger {
    background: transparent;
    border: 1px solid #ef444440;
    color: #ef4444;
  }
  .btn-danger:hover { background: #ef444420; }

  /* Add expense form */
  .add-form {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: flex-end;
    background: #0a0f1e;
    border: 1px solid #1e2d45;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .8px; }
  .select-inp {
    background: #141d2e;
    border: 1px solid #1e2d45;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 13px;
    padding: 8px 10px;
    outline: none;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
  }

  /* Tooltip override */
  .recharts-tooltip-wrapper { font-family: 'DM Sans', sans-serif !important; }

  /* Alert box */
  .alert {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #f59e0b18;
    border: 1px solid #f59e0b40;
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
    color: #f59e0b;
    margin-bottom: 20px;
  }

  .row { display: flex; align-items: center; gap: 12px; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .mb-3 { margin-bottom: 12px; }
  .mb-4 { margin-bottom: 16px; }
  .mt-1 { margin-top: 4px; }
  .text-muted { color: #64748b; font-size: 13px; }
  .text-sm { font-size: 13px; }
  .text-xs { font-size: 11px; }
  .font-bold { font-weight: 700; }
  .w-full { width: 100%; }
  .overflow-auto { overflow: auto; }

  @media (max-width: 900px) {
    .grid4 { grid-template-columns: 1fr 1fr; }
    .grid3 { grid-template-columns: 1fr 1fr; }
    .grid2 { grid-template-columns: 1fr; }
    .sidebar { display: none; }
    .mobile-period-bar { display: block; }
    .mobile-nav { display: flex; gap: 6px; }
    .main { margin-left: 0; padding: 16px 16px 92px; }
    .auth-card { width: calc(100% - 32px); padding: 36px 24px; border-radius: 14px; }
    .page-title { font-size: 23px; }
    .page-sub { margin-bottom: 20px; }
    .card { border-radius: 12px; padding: 16px; }
    .inp, .select-inp, .month-selector {
      min-height: 42px;
      font-size: 16px;
    }
    .logout-btn { min-height: 42px; padding: 10px 14px; }
    .btn { min-height: 42px; }
    .check-box { width: 24px; height: 24px; }
    .check-tick { font-size: 14px; }
    .tbl { min-width: 680px; }
    .tbl th, .tbl td { padding: 12px 10px; }
    .overflow-auto {
      margin-left: -4px;
      margin-right: -4px;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }
    .add-form { align-items: stretch; }
    .add-form .form-group { width: 100%; }
    .add-form .inp,
    .add-form .select-inp { width: 100% !important; }
  }

  @media (max-width: 560px) {
    .grid4, .grid3 { grid-template-columns: 1fr; }
    .kpi { padding: 16px; }
    .kpi-value { font-size: 21px; }
    .page-title { font-size: 22px; }
    .page-sub { font-size: 13px; }
    .auth-wrap { align-items: flex-start; padding-top: 72px; }
    .auth-logo { font-size: 26px; }
    .mobile-nav-item {
      min-width: 64px;
      font-size: 10px;
      padding: 7px 6px;
    }
    .mobile-nav-icon { font-size: 15px; }
    .sec-hdr { font-size: 12px; letter-spacing: 1px; }
  }
`;

// ─── Components ───────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = "#3b82f6" }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const col = w > 90 ? "#ef4444" : w > 70 ? "#f59e0b" : color;
  return (
    <div className="prog-wrap">
      <div className="prog-bar-bg">
        <div className="prog-bar" style={{ width: `${w}%`, background: col }} />
      </div>
    </div>
  );
}

function KPI({ label, value, sub, color = "blue", big }) {
  return (
    <div className={`kpi ${color}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${big || ""}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function CheckBox({ checked, onChange }) {
  return (
    <div className={`check-box ${checked ? "checked" : ""}`} onClick={onChange} role="checkbox" aria-checked={checked}>
      {checked && <span className="check-tick">✓</span>}
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const login = async () => {
    setSubmitting(true);
    setErr("");

    try {
      await loginWithPassword(pass);
      onLogin();
    } catch {
      setErr("Неверный пароль");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">Finance<span>.</span></div>
        <div className="auth-sub">Личный финансовый трекер</div>
        <label className="auth-label">Пароль для входа</label>
        <input
          className="auth-input"
          type="password"
          placeholder="••••••••••"
          value={pass}
          onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
          autoFocus
        />
        {err && <div className="auth-err">{err}</div>}
        <button className="auth-btn" onClick={login} disabled={submitting}>
          {submitting ? "Проверка..." : "Войти"}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ monthData, updateMonth, periodLabel }) {
  const obligTotal  = OBLIGATORY.reduce((s, i) => s + i.plan, 0);
  const variableTotal = VARIABLE.reduce((s, i) => s + i.plan, 0);
  const reserveTotal  = RESERVE.reduce((s, i) => s + i.plan, 0);
  const totalPlan = obligTotal + variableTotal + reserveTotal;

  const factOblig = OBLIGATORY.reduce((s, i) => s + (monthData.obligatory[i.id]?.fact || 0), 0);
  const factVar   = VARIABLE.reduce((s, i) => s + (monthData.variable[i.id] || 0), 0);
  const factRes   = RESERVE.reduce((s, i) => s + (monthData.reserve[i.id] || 0), 0);
  const totalFact = factOblig + factVar + factRes;
  const income    = monthData.income || 0;
  const balance   = income - totalFact;

  const pieData = [
    { name: "Обязательные", value: obligTotal },
    { name: "Переменные",   value: variableTotal },
    { name: "Резерв",       value: reserveTotal },
    { name: "Остаток",      value: Math.max(0, 250000 - totalPlan) },
  ];

  const paidCount = OBLIGATORY.filter(i => monthData.obligatory[i.id]?.paid).length;

  const today = new Date().getDate();
  const alerts = [];
  if (today >= 1 && today <= 3 && !monthData.obligatory.mortgage?.paid)
    alerts.push("⚠️ Ипотека — оплата 3-го числа!");
  if (today >= 24 && today <= 26 && !monthData.obligatory.car_loan?.paid)
    alerts.push("⚠️ Автокредит — оплата 26-го числа!");

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#141d2e", border: "1px solid #1e2d45", borderRadius: 8, padding: "10px 14px" }}>
        <div style={{ color: "#f1f5f9", fontWeight: 700 }}>{payload[0].name}</div>
        <div style={{ color: payload[0].fill, fontSize: 15 }}>{fmt(payload[0].value)}</div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-title">Дашборд</div>
      <div className="page-sub">Обзор финансов за период: {periodLabel}</div>

      {alerts.map(a => <div className="alert" key={a}>{a}</div>)}

      {/* Income input */}
      <div className="card mb-4" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Доход за месяц (факт)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              className="inp"
              style={{ width: 160, fontSize: 18, fontFamily: "'Syne',sans-serif", fontWeight: 800 }}
              type="number"
              value={income || ""}
              placeholder="250 000"
              onChange={e => updateMonth({ income: +e.target.value })}
            />
            <span style={{ color: "#64748b" }}>₽</span>
          </div>
        </div>
        <div style={{ color: "#1e2d45", fontSize: 20 }}>|</div>
        <div className="text-muted text-sm">
          План: <strong style={{ color: "#f1f5f9" }}>250 000 ₽</strong> &nbsp;
          Оплачено: <strong style={{ color: "#10b981" }}>{paidCount}/{OBLIGATORY.length}</strong> обязательных
        </div>
      </div>

      {/* KPIs */}
      <div className="grid4 mb-4">
        <KPI label="Доход" value={income ? fmt(income) : "—"} sub="факт" color="blue" />
        <KPI label="Расходы факт" value={fmt(totalFact)} sub={`план ${fmt(totalPlan)}`} color="red" />
        <KPI
          label="Баланс"
          value={income ? fmt(balance) : "—"}
          sub={balance >= 0 ? "✅ Профицит" : "⚠️ Дефицит"}
          color={balance >= 0 ? "green" : "red"}
          big={balance >= 0 ? "green" : "red"}
        />
        <KPI label="% расходов" value={income ? pct(totalFact, income) + "%" : "—"} sub="от дохода" color="amber" />
      </div>

      <div className="grid2">
        {/* Pie chart */}
        <div className="card">
          <div className="sec-hdr" style={{ marginTop: 0 }}>Структура расходов (план)</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 8 }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PIE_COLORS[i] }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>

        {/* Obligatory quick view */}
        <div className="card">
          <div className="sec-hdr" style={{ marginTop: 0 }}>Обязательные платежи</div>
          {OBLIGATORY.slice(0, 6).map(item => {
            const fact = monthData.obligatory[item.id]?.fact || 0;
            return (
              <div key={item.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2 }}>
                  <span>{item.label}</span>
                  <span style={{ color: "#64748b" }}>{fmt(item.plan)}</span>
                </div>
                <ProgressBar value={fact} max={item.plan} />
              </div>
            );
          })}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #1e2d45", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>Итого обязательные</span>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "#ef4444" }}>{fmt(obligTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Obligatory Page ──────────────────────────────────────────────────────────
function ObligatoryPage({ monthData, updateMonth }) {
  const update = (id, field, value) => {
    updateMonth({
      obligatory: {
        ...monthData.obligatory,
        [id]: { ...monthData.obligatory[id], [field]: value }
      }
    });
  };

  const togglePaid = (item) => {
    const current = monthData.obligatory[item.id] || {};
    const nextPaid = !current.paid;

    updateMonth({
      obligatory: {
        ...monthData.obligatory,
        [item.id]: {
          ...current,
          paid: nextPaid,
          fact: nextPaid && !current.fact ? item.plan : (current.fact || 0),
        }
      }
    });
  };

  const totalPlan = OBLIGATORY.reduce((s, i) => s + i.plan, 0);
  const totalFact = OBLIGATORY.reduce((s, i) => s + (monthData.obligatory[i.id]?.fact || 0), 0);

  return (
    <div>
      <div className="page-title">Обязательные расходы</div>
      <div className="page-sub">Фиксированные платежи каждого месяца</div>

      <div className="grid2 mb-4">
        <KPI label="План итого" value={fmt(totalPlan)} color="red" />
        <KPI label="Факт итого" value={fmt(totalFact)} sub={`Осталось внести: ${fmt(totalPlan - totalFact)}`} color={totalFact >= totalPlan ? "green" : "amber"} />
      </div>

      <div className="card overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Статья</th>
              <th>Дата</th>
              <th style={{ textAlign: "right" }}>План</th>
              <th style={{ textAlign: "right" }}>Факт (₽)</th>
              <th style={{ textAlign: "center" }}>Оплачено</th>
              <th>Прогресс</th>
            </tr>
          </thead>
          <tbody>
            {OBLIGATORY.map(item => {
              const d = monthData.obligatory[item.id] || {};
              const fact = d.fact || 0;
              return (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{item.label}</div>
                    <div className="text-xs text-muted">{item.note}</div>
                  </td>
                  <td><span className="badge badge-blue">{item.day}</span></td>
                  <td className="num">{fmt(item.plan)}</td>
                  <td>
                    <input
                      className="inp"
                      type="number"
                      value={fact || ""}
                      placeholder={item.plan}
                      onChange={e => update(item.id, "fact", +e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <CheckBox checked={!!d.paid} onChange={() => togglePaid(item)} />
                  </td>
                  <td style={{ minWidth: 100 }}>
                    <ProgressBar value={fact} max={item.plan} />
                    <div className="text-xs text-muted mt-1">{pct(fact, item.plan)}%</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #1e2d45" }}>
              <td colSpan={2} style={{ fontWeight: 700, padding: "12px 12px" }}>ИТОГО</td>
              <td className="num" style={{ color: "#ef4444" }}>{fmt(totalPlan)}</td>
              <td className="num" style={{ color: "#f59e0b" }}>{fmt(totalFact)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Variable Expenses ────────────────────────────────────────────────────────
function VariablePage({ monthData, updateMonth }) {
  const update = (id, value) => updateMonth({ variable: { ...monthData.variable, [id]: value } });
  const totalPlan = VARIABLE.reduce((s, i) => s + i.plan, 0);
  const totalFact = VARIABLE.reduce((s, i) => s + (monthData.variable[i.id] || 0), 0);

  return (
    <div>
      <div className="page-title">Переменные расходы</div>
      <div className="page-sub">Расходы, которые меняются каждый месяц</div>

      <div className="grid2 mb-4">
        <KPI label="Бюджет" value={fmt(totalPlan)} color="blue" />
        <KPI label="Потрачено" value={fmt(totalFact)} sub={`Осталось: ${fmt(totalPlan - totalFact)}`} color={totalFact > totalPlan ? "red" : "green"} />
      </div>

      <div className="card overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Категория</th>
              <th style={{ textAlign: "center" }}>Раздел</th>
              <th style={{ textAlign: "right" }}>Бюджет</th>
              <th style={{ textAlign: "right" }}>Факт (₽)</th>
              <th style={{ textAlign: "right" }}>Остаток</th>
              <th>Прогресс</th>
            </tr>
          </thead>
          <tbody>
            {VARIABLE.map(item => {
              const fact = monthData.variable[item.id] || 0;
              const rem  = item.plan - fact;
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500 }}>{item.label}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className="badge badge-purple">{item.cat}</span>
                  </td>
                  <td className="num">{fmt(item.plan)}</td>
                  <td>
                    <input className="inp" type="number" value={fact || ""} placeholder="0"
                      onChange={e => update(item.id, +e.target.value)} />
                  </td>
                  <td className="num" style={{ color: rem >= 0 ? "#10b981" : "#ef4444" }}>{fmt(rem)}</td>
                  <td style={{ minWidth: 100 }}>
                    <ProgressBar value={fact} max={item.plan} color="#8b5cf6" />
                    <div className="text-xs text-muted mt-1">{pct(fact, item.plan)}%</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #1e2d45" }}>
              <td colSpan={2} style={{ fontWeight: 700, padding: "12px 12px" }}>ИТОГО</td>
              <td className="num" style={{ color: "#8b5cf6" }}>{fmt(totalPlan)}</td>
              <td className="num" style={{ color: "#f59e0b" }}>{fmt(totalFact)}</td>
              <td className="num" style={{ color: totalPlan - totalFact >= 0 ? "#10b981" : "#ef4444" }}>{fmt(totalPlan - totalFact)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Reserve Page ─────────────────────────────────────────────────────────────
function ReservePage({ monthData, updateMonth }) {
  const update = (id, value) => updateMonth({ reserve: { ...monthData.reserve, [id]: value } });
  const totalPlan = RESERVE.reduce((s, i) => s + i.plan, 0);
  const totalFact = RESERVE.reduce((s, i) => s + (monthData.reserve[i.id] || 0), 0);

  return (
    <div>
      <div className="page-title">Резерв и форс-мажор</div>
      <div className="page-sub">Юридические расходы, суды и непредвиденные ситуации</div>

      <div className="alert">
        ⚖️ Резерв на юристов и суды — рекомендуется откладывать ежемесячно, даже если расходов нет
      </div>

      <div className="grid2 mb-4">
        <KPI label="Резерв план" value={fmt(totalPlan)} color="purple" />
        <KPI label="Использовано" value={fmt(totalFact)} sub={`Не использовано: ${fmt(totalPlan - totalFact)}`} color={totalFact > totalPlan ? "red" : "green"} />
      </div>

      <div className="card overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Статья</th>
              <th style={{ textAlign: "right" }}>Резерв (₽)</th>
              <th style={{ textAlign: "right" }}>Факт (₽)</th>
              <th style={{ textAlign: "right" }}>Остаток</th>
              <th>Прогресс</th>
            </tr>
          </thead>
          <tbody>
            {RESERVE.map(item => {
              const fact = monthData.reserve[item.id] || 0;
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500 }}>{item.label}</td>
                  <td className="num">{fmt(item.plan)}</td>
                  <td>
                    <input className="inp" type="number" value={fact || ""} placeholder="0"
                      onChange={e => update(item.id, +e.target.value)} />
                  </td>
                  <td className="num" style={{ color: item.plan - fact >= 0 ? "#10b981" : "#ef4444" }}>{fmt(item.plan - fact)}</td>
                  <td style={{ minWidth: 100 }}>
                    <ProgressBar value={fact} max={item.plan} color="#8b5cf6" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #1e2d45" }}>
              <td style={{ fontWeight: 700, padding: "12px 12px" }}>ИТОГО</td>
              <td className="num" style={{ color: "#8b5cf6" }}>{fmt(totalPlan)}</td>
              <td className="num" style={{ color: "#f59e0b" }}>{fmt(totalFact)}</td>
              <td className="num" style={{ color: "#10b981" }}>{fmt(totalPlan - totalFact)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Expense Journal ──────────────────────────────────────────────────────────
const ALL_CATS = [...new Set([
  ...OBLIGATORY.map(i => i.label.replace(/[^\wА-яё ]/gu, "").trim()),
  ...VARIABLE.map(i => i.cat),
  "Юридические", "Форс-мажор", "Прочее"
])];

function ExpensesPage({ monthData, updateMonth }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), desc: "", cat: "Прочее", amount: "", method: "Карта" });

  const add = () => {
    if (!form.amount || !form.desc) return;
    const exp = [...(monthData.expenses || []), { ...form, id: Date.now() }];
    updateMonth({ expenses: exp });
    setForm(f => ({ ...f, desc: "", amount: "" }));
  };

  const del = (id) => updateMonth({ expenses: (monthData.expenses || []).filter(e => e.id !== id) });

  const total = (monthData.expenses || []).reduce((s, e) => s + +e.amount, 0);

  return (
    <div>
      <div className="page-title">Журнал расходов</div>
      <div className="page-sub">Детализация каждой траты</div>

      <div className="add-form">
        <div className="form-group">
          <label className="form-label">Дата</label>
          <input className="inp inp-sm select-inp" type="date" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label">Описание</label>
          <input className="inp inp-wide select-inp" style={{ width: 200 }} type="text" placeholder="Куда потратил..."
            value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Категория</label>
          <select className="select-inp" value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}>
            {["Питание","Личное","Здоровье","Отдых","Развитие","Дом","Прочее","Юридические","Ипотека","Автокредит","Бензин","ЖКХ"].map(c =>
              <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Сумма (₽)</label>
          <input className="inp" type="number" placeholder="0" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Способ</label>
          <select className="select-inp" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
            {["Карта","Наличные","Перевод"].map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <button className="btn" onClick={add}>+ Добавить</button>
      </div>

      <div className="card overflow-auto">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="text-muted text-sm">{(monthData.expenses || []).length} записей</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: "#ef4444" }}>
            Итого: {fmt(total)}
          </div>
        </div>
        {(monthData.expenses || []).length === 0 ? (
          <div style={{ textAlign: "center", color: "#1e2d45", padding: "40px 0", fontSize: 14 }}>
            Нет записей. Добавьте первый расход выше.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Описание</th>
                <th>Категория</th>
                <th style={{ textAlign: "right" }}>Сумма</th>
                <th>Способ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...(monthData.expenses || [])].reverse().map(e => (
                <tr key={e.id}>
                  <td className="text-sm text-muted">{e.date}</td>
                  <td style={{ fontWeight: 500 }}>{e.desc}</td>
                  <td><span className="badge badge-blue">{e.cat}</span></td>
                  <td className="num" style={{ color: "#ef4444" }}>{fmt(+e.amount)}</td>
                  <td className="text-sm text-muted">{e.method}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => del(e.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Loans Page ───────────────────────────────────────────────────────────────
function LoansPage({ data, setData }) {
  const loans = data.loans || [
    { id: 1, name: "🏠 Ипотека",    balance: 0, payment: 48000, rate: 0, date: "", bank: "" },
    { id: 2, name: "🚗 Автокредит", balance: 0, payment: 58000, rate: 0, date: "", bank: "" },
  ];

  const update = (id, field, value) => {
    setData(d => ({
      ...d,
      loans: (d.loans || loans).map(l => l.id === id ? { ...l, [field]: value } : l)
    }));
  };

  const totalPayment = loans.reduce((s, l) => s + (+l.payment || 0), 0);
  const totalBalance = loans.reduce((s, l) => s + (+l.balance || 0), 0);

  return (
    <div>
      <div className="page-title">Трекер кредитов</div>
      <div className="page-sub">Контроль долговой нагрузки</div>

      <div className="grid2 mb-4">
        <KPI label="Общий долг" value={fmt(totalBalance)} sub="Введите остатки вручную" color="red" />
        <KPI label="Ежемес. платёж" value={fmt(totalPayment)} sub={`${pct(totalPayment, 250000)}% от среднего дохода`} color="amber" />
      </div>

      <div className="card overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Кредит</th>
              <th style={{ textAlign: "right" }}>Остаток долга</th>
              <th style={{ textAlign: "right" }}>Платёж/мес</th>
              <th style={{ textAlign: "right" }}>Ставка %</th>
              <th>Дата окончания</th>
              <th>Банк</th>
            </tr>
          </thead>
          <tbody>
            {loans.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.name}</td>
                <td>
                  <input className="inp" type="number" placeholder="Остаток..." value={l.balance || ""}
                    onChange={e => update(l.id, "balance", e.target.value)} />
                </td>
                <td>
                  <input className="inp" type="number" value={l.payment || ""}
                    onChange={e => update(l.id, "payment", e.target.value)} />
                </td>
                <td>
                  <input className="inp inp-sm" type="number" step="0.1" placeholder="%" value={l.rate || ""}
                    onChange={e => update(l.id, "rate", e.target.value)} />
                </td>
                <td>
                  <input className="inp select-inp" type="date" value={l.date || ""}
                    onChange={e => update(l.id, "date", e.target.value)} />
                </td>
                <td>
                  <input className="inp" style={{ width: 130 }} type="text" placeholder="Банк..." value={l.bank || ""}
                    onChange={e => update(l.id, "bank", e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #1e2d45" }}>
              <td style={{ fontWeight: 700, padding: "12px 12px" }}>ИТОГО</td>
              <td className="num" style={{ color: "#ef4444" }}>{fmt(totalBalance)}</td>
              <td className="num" style={{ color: "#f59e0b" }}>{fmt(totalPayment)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="sec-hdr">Долговая нагрузка</div>
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>Платежи по кредитам от дохода</span>
            <span style={{ color: pct(totalPayment, 250000) > 50 ? "#ef4444" : "#10b981", fontWeight: 700 }}>
              {pct(totalPayment, 250000)}%
            </span>
          </div>
          <ProgressBar value={totalPayment} max={250000} color="#ef4444" />
        </div>
        <div className="text-sm text-muted">
          {pct(totalPayment, 250000) > 40
            ? "⚠️ Долговая нагрузка высокая (>40%). Рекомендуется снизить."
            : "✅ Долговая нагрузка в норме (<40% дохода)."}
        </div>
      </div>
    </div>
  );
}

// ─── Annual Page ──────────────────────────────────────────────────────────────
function AnnualPage({ allData }) {
  const year = new Date().getFullYear();
  const rows = MONTHS_RU.map((m, i) => {
    const key = mkKey(year, i);
    const md  = allData[key] || defaultMonthData();
    const obligFact = OBLIGATORY.reduce((s, it) => s + (md.obligatory[it.id]?.fact || 0), 0);
    const varFact   = VARIABLE.reduce((s, it) => s + (md.variable[it.id] || 0), 0);
    const resFact   = RESERVE.reduce((s, it) => s + (md.reserve[it.id] || 0), 0);
    const total = obligFact + varFact + resFact;
    return { month: m, income: md.income || 0, total, balance: (md.income || 0) - total };
  });

  const chartData = rows.map(r => ({
    name: r.month,
    Доход: r.income,
    Расходы: r.total,
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#141d2e", border: "1px solid #1e2d45", borderRadius: 8, padding: "10px 14px" }}>
        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color, fontWeight: 700, fontSize: 14 }}>
            {p.name}: {fmt(p.value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="page-title">Год {year}</div>
      <div className="page-sub">Динамика доходов и расходов по месяцам</div>

      <div className="card mb-4" style={{ padding: "20px 12px" }}>
        <div className="sec-hdr" style={{ marginTop: 0, marginBottom: 16 }}>Доходы vs Расходы</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} barGap={4}>
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => v > 0 ? (v / 1000) + "к" : ""} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Доход" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Месяц</th>
              <th style={{ textAlign: "right" }}>Доход</th>
              <th style={{ textAlign: "right" }}>Расходы</th>
              <th style={{ textAlign: "right" }}>Баланс</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.month}>
                <td style={{ fontWeight: 600 }}>{r.month}</td>
                <td className="num" style={{ color: "#3b82f6" }}>{r.income ? fmt(r.income) : "—"}</td>
                <td className="num" style={{ color: "#ef4444" }}>{r.total ? fmt(r.total) : "—"}</td>
                <td className="num" style={{ color: r.balance >= 0 ? "#10b981" : "#ef4444" }}>
                  {r.income ? fmt(r.balance) : "—"}
                </td>
                <td>
                  {!r.income ? <span className="badge badge-amber">Не заполнен</span>
                    : r.balance >= 0 ? <span className="badge badge-green">✅ Профицит</span>
                    : <span className="badge badge-red">⚠️ Дефицит</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary Page (Excel-style full view) ─────────────────────────────────────
function SummaryPage({ monthData, updateMonth, periodLabel }) {
  const updOblig = (id, field, value) =>
    updateMonth({ obligatory: { ...monthData.obligatory, [id]: { ...monthData.obligatory[id], [field]: value } } });
  const toggleObligPaid = (item) => {
    const current = monthData.obligatory[item.id] || {};
    const nextPaid = !current.paid;

    updateMonth({
      obligatory: {
        ...monthData.obligatory,
        [item.id]: {
          ...current,
          paid: nextPaid,
          fact: nextPaid && !current.fact ? item.plan : (current.fact || 0),
        }
      }
    });
  };
  const updVar = (id, value) =>
    updateMonth({ variable: { ...monthData.variable, [id]: value } });
  const updRes = (id, value) =>
    updateMonth({ reserve: { ...monthData.reserve, [id]: value } });

  const obligPlan = OBLIGATORY.reduce((s, i) => s + i.plan, 0);
  const obligFact = OBLIGATORY.reduce((s, i) => s + (monthData.obligatory[i.id]?.fact || 0), 0);
  const varPlan   = VARIABLE.reduce((s, i) => s + i.plan, 0);
  const varFact   = VARIABLE.reduce((s, i) => s + (monthData.variable[i.id] || 0), 0);
  const resPlan   = RESERVE.reduce((s, i) => s + i.plan, 0);
  const resFact   = RESERVE.reduce((s, i) => s + (monthData.reserve[i.id] || 0), 0);
  const totalPlan = obligPlan + varPlan + resPlan;
  const totalFact = obligFact + varFact + resFact;
  const income    = monthData.income || 0;
  const balPlan   = 250000 - totalPlan;
  const balFact   = income - totalFact;

  const SectionHeader = ({ emoji, title, color }) => (
    <tr>
      <td colSpan={6} style={{
        background: color, padding: "9px 14px",
        fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12,
        textTransform: "uppercase", letterSpacing: 1.5, color: "#fff"
      }}>
        {emoji} {title}
      </td>
    </tr>
  );

  const TotalRow = ({ label, plan, fact, color }) => {
    const diff = fact - plan;
    return (
      <tr style={{ background: color + "22", borderTop: "2px solid " + color }}>
        <td colSpan={2} style={{ padding: "10px 14px", fontWeight: 700, color, fontSize: 13 }}>{label}</td>
        <td style={{ textAlign: "right", padding: "10px 14px", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color }}>{fmt(plan)}</td>
        <td style={{ textAlign: "right", padding: "10px 14px", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: fact > 0 ? "#f1f5f9" : "#64748b" }}>{fact > 0 ? fmt(fact) : "—"}</td>
        <td style={{ textAlign: "right", padding: "10px 14px", fontFamily: "'Syne',sans-serif", fontWeight: 700, color: diff > 0 ? "#ef4444" : "#10b981" }}>
          {fact > 0 ? (diff > 0 ? "+" : "") + fmt(diff) : "—"}
        </td>
        <td style={{ textAlign: "center", padding: "10px 14px" }}>
          {fact > 0 ? <span className={`badge ${pct(fact, plan) > 100 ? "badge-red" : "badge-green"}`}>{pct(fact, plan)}%</span> : "—"}
        </td>
      </tr>
    );
  };

  const thStyle = {
    background: "#0a0f1e", color: "#64748b", fontSize: 11,
    textTransform: "uppercase", letterSpacing: 1, padding: "10px 14px",
    textAlign: "left", fontWeight: 600, position: "sticky", top: 0, zIndex: 2,
    borderBottom: "1px solid #1e2d45"
  };

  return (
    <div>
      <div className="page-title">Сводная таблица</div>
      <div className="page-sub">Полная картина месяца: {periodLabel}. Все данные в одном месте.</div>

      {/* Hint banner */}
      <div style={{
        background: "#3b82f610", border: "1px solid #3b82f630", borderRadius: 10,
        padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#93c5fd",
        display: "flex", gap: 10, alignItems: "center"
      }}>
        <span style={{ fontSize: 18 }}>💡</span>
        <span>
          <strong>Как заполнять:</strong> кликните на любую ячейку в колонке <strong>"Факт"</strong> и введите сумму.
          Чекбокс ✓ — отмечает платеж оплаченным и подставляет плановую сумму, если факт еще пустой.
          Все изменения сохраняются автоматически.
        </span>
      </div>

      {/* Income row */}
      <div style={{
        background: "#141d2e", border: "1px solid #1e2d45", borderRadius: 12,
        padding: "16px 20px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap"
      }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            💵 Доход за месяц
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              className="inp" type="number"
              style={{ width: 160, fontSize: 20, fontFamily: "'Syne',sans-serif", fontWeight: 800, color: "#3b82f6" }}
              value={income || ""} placeholder="250 000"
              onChange={e => updateMonth({ income: +e.target.value })}
            />
            <span style={{ color: "#64748b", fontSize: 16 }}>₽</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {[
            { l: "План расходов",  v: fmt(totalPlan),  c: "#ef4444" },
            { l: "Факт расходов",  v: totalFact > 0 ? fmt(totalFact) : "—", c: "#f59e0b" },
            { l: "Баланс (план)",  v: fmt(balPlan),    c: balPlan >= 0 ? "#10b981" : "#ef4444" },
            { l: "Баланс (факт)",  v: income > 0 ? fmt(balFact) : "—", c: balFact >= 0 ? "#10b981" : "#ef4444" },
          ].map(({ l, v, c }) => (
            <div key={l}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{l}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main table */}
      <div style={{ background: "#141d2e", border: "1px solid #1e2d45", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 32 }}></th>
                <th style={{ ...thStyle, minWidth: 200 }}>Статья расходов</th>
                <th style={{ ...thStyle, textAlign: "right", minWidth: 130 }}>
                  <span style={{ color: "#3b82f6" }}>● </span>План (₽)
                </th>
                <th style={{ ...thStyle, textAlign: "right", minWidth: 150 }}>
                  <span style={{ color: "#f59e0b" }}>● </span>Факт (₽) — <span style={{ color: "#f59e0b", fontStyle: "italic" }}>введите</span>
                </th>
                <th style={{ ...thStyle, textAlign: "right", minWidth: 130 }}>Отклонение</th>
                <th style={{ ...thStyle, textAlign: "center", minWidth: 90 }}>% / Статус</th>
              </tr>
            </thead>
            <tbody>
              {/* ── OBLIGATORY ── */}
              <SectionHeader emoji="🔒" title="Обязательные платежи" color="#b91c1c" />
              {OBLIGATORY.map((item, i) => {
                const d = monthData.obligatory[item.id] || {};
                const fact = d.fact || 0;
                const diff = fact - item.plan;
                const bg = i % 2 === 0 ? "#141d2e" : "#0f1929";
                return (
                  <tr key={item.id} style={{ background: bg }}>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <div
                        style={{
                          width: 18, height: 18, borderRadius: 5, border: "2px solid",
                          borderColor: d.paid ? "#10b981" : "#1e2d45",
                          background: d.paid ? "#10b981" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", margin: "0 auto", fontSize: 11, color: "#fff", fontWeight: 700
                        }}
                        onClick={() => toggleObligPaid(item)}
                      >{d.paid ? "✓" : ""}</div>
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{item.day} · {item.note}</div>
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#94a3b8" }}>
                      {fmt(item.plan)}
                    </td>
                    <td style={{ padding: "6px 14px", textAlign: "right" }}>
                      <input
                        className="inp" type="number"
                        style={{ width: 120, textAlign: "right", background: "#0a0f1e", borderColor: fact > 0 ? "#3b82f640" : "#1e2d45" }}
                        value={fact || ""} placeholder={item.plan}
                        onChange={e => updOblig(item.id, "fact", +e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 700, color: fact === 0 ? "#374151" : diff > 0 ? "#ef4444" : "#10b981", fontSize: 14 }}>
                      {fact > 0 ? (diff > 0 ? "+" : "") + fmt(diff) : "—"}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      {fact > 0
                        ? <span className={`badge ${d.paid ? "badge-green" : "badge-amber"}`}>{d.paid ? "✅ Оплачено" : "⏳ Ожидает"}</span>
                        : <span style={{ color: "#374151", fontSize: 12 }}>не заполнено</span>}
                    </td>
                  </tr>
                );
              })}
              <TotalRow label="Итого обязательные" plan={obligPlan} fact={obligFact} color="#ef4444" />

              {/* ── VARIABLE ── */}
              <SectionHeader emoji="📊" title="Переменные расходы" color="#1d4ed8" />
              {VARIABLE.map((item, i) => {
                const fact = monthData.variable[item.id] || 0;
                const diff = fact - item.plan;
                const bg = i % 2 === 0 ? "#141d2e" : "#0f1929";
                return (
                  <tr key={item.id} style={{ background: bg }}>
                    <td style={{ padding: "8px 10px" }} />
                    <td style={{ padding: "8px 14px" }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{item.cat}</div>
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#94a3b8" }}>
                      {fmt(item.plan)}
                    </td>
                    <td style={{ padding: "6px 14px", textAlign: "right" }}>
                      <input
                        className="inp" type="number"
                        style={{ width: 120, textAlign: "right", background: "#0a0f1e", borderColor: fact > 0 ? "#3b82f640" : "#1e2d45" }}
                        value={fact || ""} placeholder="0"
                        onChange={e => updVar(item.id, +e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 700, color: fact === 0 ? "#374151" : diff > 0 ? "#ef4444" : "#10b981", fontSize: 14 }}>
                      {fact > 0 ? (diff > 0 ? "+" : "") + fmt(diff) : "—"}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      {fact > 0
                        ? <span className={`badge ${diff > 0 ? "badge-red" : "badge-green"}`}>{pct(fact, item.plan)}%</span>
                        : <span style={{ color: "#374151", fontSize: 12 }}>не заполнено</span>}
                    </td>
                  </tr>
                );
              })}
              <TotalRow label="Итого переменные" plan={varPlan} fact={varFact} color="#3b82f6" />

              {/* ── RESERVE ── */}
              <SectionHeader emoji="⚖️" title="Резерв / Непредвиденные / Юристы" color="#6d28d9" />
              {RESERVE.map((item, i) => {
                const fact = monthData.reserve[item.id] || 0;
                const diff = fact - item.plan;
                const bg = i % 2 === 0 ? "#141d2e" : "#0f1929";
                return (
                  <tr key={item.id} style={{ background: bg }}>
                    <td style={{ padding: "8px 10px" }} />
                    <td style={{ padding: "8px 14px", fontSize: 14, fontWeight: 500 }}>{item.label}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#94a3b8" }}>
                      {fmt(item.plan)}
                    </td>
                    <td style={{ padding: "6px 14px", textAlign: "right" }}>
                      <input
                        className="inp" type="number"
                        style={{ width: 120, textAlign: "right", background: "#0a0f1e", borderColor: fact > 0 ? "#3b82f640" : "#1e2d45" }}
                        value={fact || ""} placeholder="0"
                        onChange={e => updRes(item.id, +e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 700, color: fact === 0 ? "#374151" : diff > 0 ? "#ef4444" : "#10b981", fontSize: 14 }}>
                      {fact > 0 ? (diff > 0 ? "+" : "") + fmt(diff) : "—"}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      {fact > 0
                        ? <span className={`badge ${diff > 0 ? "badge-red" : "badge-green"}`}>{pct(fact, item.plan)}%</span>
                        : <span style={{ color: "#374151", fontSize: 12 }}>не заполнено</span>}
                    </td>
                  </tr>
                );
              })}
              <TotalRow label="Итого резерв" plan={resPlan} fact={resFact} color="#8b5cf6" />

              {/* ── GRAND TOTAL ── */}
              <tr style={{ background: "#0a0f1e", borderTop: "2px solid #3b82f640" }}>
                <td colSpan={2} style={{ padding: "14px 14px", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: "#f1f5f9" }}>
                  💰 ИТОГО РАСХОДОВ
                </td>
                <td style={{ padding: "14px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: "#ef4444" }}>
                  {fmt(totalPlan)}
                </td>
                <td style={{ padding: "14px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: totalFact > 0 ? "#f59e0b" : "#374151" }}>
                  {totalFact > 0 ? fmt(totalFact) : "—"}
                </td>
                <td style={{ padding: "14px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: totalFact === 0 ? "#374151" : totalFact - totalPlan > 0 ? "#ef4444" : "#10b981" }}>
                  {totalFact > 0 ? ((totalFact - totalPlan > 0 ? "+" : "") + fmt(totalFact - totalPlan)) : "—"}
                </td>
                <td style={{ padding: "14px 14px", textAlign: "center" }}>
                  {totalFact > 0 && <span className={`badge ${pct(totalFact, totalPlan) > 100 ? "badge-red" : "badge-green"}`}>{pct(totalFact, totalPlan)}%</span>}
                </td>
              </tr>

              {/* ── BALANCE ── */}
              <tr style={{ background: balFact >= 0 ? "#10b98112" : "#ef444412", borderTop: "2px solid #1e2d45" }}>
                <td colSpan={2} style={{ padding: "14px 14px", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: "#f1f5f9" }}>
                  {balFact >= 0 ? "✅" : "⚠️"} БАЛАНС (остаток)
                </td>
                <td style={{ padding: "14px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: balPlan >= 0 ? "#10b981" : "#ef4444" }}>
                  {fmt(balPlan)}
                </td>
                <td style={{ padding: "14px 14px", textAlign: "right", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: income > 0 ? (balFact >= 0 ? "#10b981" : "#ef4444") : "#374151" }}>
                  {income > 0 ? fmt(balFact) : "Введите доход ↑"}
                </td>
                <td colSpan={2} style={{ padding: "14px 14px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
                  {income > 0 ? (balFact >= 0 ? "Профицит бюджета" : "Перерасход!") : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#374151", textAlign: "center" }}>
        🟢 Синий = план · 🟡 Жёлтый = факт (вводите вы) · Отклонение = Факт − План · % = сколько от плана потрачено
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: "summary",     icon: "🗂️", label: "Сводная таблица" },
  { id: "dashboard",   icon: "📊", label: "Дашборд" },
  { id: "obligatory",  icon: "🔒", label: "Обязательные" },
  { id: "variable",    icon: "📈", label: "Переменные" },
  { id: "reserve",     icon: "⚖️", label: "Резерв/Юристы" },
  { id: "expenses",    icon: "📝", label: "Журнал расходов" },
  { id: "loans",       icon: "🏦", label: "Кредиты" },
  { id: "annual",      icon: "📅", label: "Год" },
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [page,   setPage]   = useState("summary");
  const [data,   setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  const now   = new Date();
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const monthKey = mkKey(selYear, selMonth);

  useEffect(() => {
    getAuthStatus().then(status => {
      if (!status.authed) {
        setLoading(false);
        return;
      }

      setAuthed(true);
      loadData().then(d => {
        if (d) setData(normalizeData(d));
        else setData({ months: {}, loans: [] });
        setLoading(false);
      });
    });
  }, []);

  useEffect(() => {
    if (data) saveData(data);
  }, [data]);

  const monthData = data?.months?.[monthKey] || defaultMonthData();

  const updateMonth = useCallback((patch) => {
    setData(d => ({
      ...d,
      months: {
        ...(d.months || {}),
        [monthKey]: normalizeMonthData({ ...(d.months?.[monthKey] || {}), ...patch })
      }
    }));
  }, [monthKey]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0f1e", color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
      Загрузка...
    </div>
  );

  if (!authed) return (
    <>
      <style>{CSS}</style>
      <AuthScreen
        onLogin={() => {
          setAuthed(true);
          setLoading(true);
          loadData().then(d => {
            if (d) setData(normalizeData(d));
            else setData({ months: {}, loans: [] });
            setLoading(false);
          });
        }}
      />
    </>
  );

  const monthOpts = [];
  for (let y = 2024; y <= now.getFullYear() + 1; y++) {
    for (let m = 0; m < 12; m++) {
      monthOpts.push({ y, m, label: `${MONTHS_RU[m]} ${y}` });
    }
  }
  const selectedPeriodLabel = `${MONTHS_RU[selMonth]} ${selYear}`;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="layout">
          <aside className="sidebar">
            <div className="sidebar-logo">Finance<span>.</span></div>
            {NAV.map(n => (
              <div key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </div>
            ))}
            <div className="sidebar-bottom">
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Период</div>
              <select className="month-selector" value={`${selYear}-${selMonth}`}
                onChange={e => {
                  const [y, m] = e.target.value.split("-");
                  setSelYear(+y); setSelMonth(+m);
                }}>
              {monthOpts.map(o => (
                  <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</option>
                ))}
              </select>
              <button className="logout-btn" onClick={() => {
                logoutSession().finally(() => {
                  setAuthed(false);
                  setData(null);
                });
              }}>Выйти</button>
            </div>
          </aside>

          <main className="main">
            <div className="mobile-period-bar">
              <div className="mobile-period-title">Период</div>
              <div className="mobile-period-row">
                <select className="month-selector" value={`${selYear}-${selMonth}`}
                  onChange={e => {
                    const [y, m] = e.target.value.split("-");
                    setSelYear(+y); setSelMonth(+m);
                  }}>
                {monthOpts.map(o => (
                    <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</option>
                  ))}
                </select>
                <button className="logout-btn" style={{ width: "auto", marginTop: 8 }} onClick={() => {
                  logoutSession().finally(() => {
                    setAuthed(false);
                    setData(null);
                  });
                }}>Выйти</button>
              </div>
            </div>
            {page === "summary"    && <SummaryPage    monthData={monthData} updateMonth={updateMonth} periodLabel={selectedPeriodLabel} />}
            {page === "dashboard"  && <Dashboard   monthData={monthData} updateMonth={updateMonth} periodLabel={selectedPeriodLabel} />}
            {page === "obligatory" && <ObligatoryPage monthData={monthData} updateMonth={updateMonth} />}
            {page === "variable"   && <VariablePage   monthData={monthData} updateMonth={updateMonth} />}
            {page === "reserve"    && <ReservePage    monthData={monthData} updateMonth={updateMonth} />}
            {page === "expenses"   && <ExpensesPage   monthData={monthData} updateMonth={updateMonth} />}
            {page === "loans"      && <LoansPage      data={data} setData={setData} />}
            {page === "annual"     && <AnnualPage     allData={data?.months || {}} />}
          </main>

          <nav className="mobile-nav" aria-label="Основная навигация">
            {NAV.map(n => (
              <button
                key={n.id}
                className={`mobile-nav-item ${page === n.id ? "active" : ""}`}
                onClick={() => setPage(n.id)}
                type="button"
              >
                <span className="mobile-nav-icon">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
