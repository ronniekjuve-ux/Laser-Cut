export const SHIFT_CYCLE = [
  ['Yura', 'Denis'],
  ['Andrey', 'Denis'],
  ['Andrey', 'Dima'],
  ['Yura', 'Dima'],
];

export const ANCHOR_DATE = new Date(2026, 5, 19);
export const ANCHOR_DAY_INDEX = 0;
export const ANCHOR_NIGHT_INDEX = 0;

export const ALL_OPERATORS = ['Yura', 'Denis', 'Andrey', 'Dima', 'Vova'];

export function dateToKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getShiftInfo(date) {
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = new Date(ANCHOR_DATE.getFullYear(), ANCHOR_DATE.getMonth(), ANCHOR_DATE.getDate());
  const diffDays = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
  let dayIndex = ((diffDays + ANCHOR_DAY_INDEX) % 4 + 4) % 4;
  const pair = SHIFT_CYCLE[dayIndex];
  let nightIndex = ((diffDays + ANCHOR_NIGHT_INDEX) % 8 + 8) % 8;
  const isVovaOn = nightIndex < 4;
  return { pair, isVovaOn };
}

export function getShiftForDate(date, overrides = {}) {
  const key = dateToKey(date);
  if (overrides[key]) {
    const o = overrides[key];
    return {
      pair: [o.st1 || '', o.st2 || ''],
      isVovaOn: o.night === 'Vova',
      isOverride: true,
    };
  }
  return { ...getShiftInfo(date), isOverride: false };
}

// Server-only overrides - no localStorage
export async function loadOverridesFromServer(month) {
  try {
    const client = (await import('../api/client')).default;
    const res = await client.get('/audit/overrides', { params: { month } });
    return res.data || {};
  } catch {
    return {};
  }
}

export async function saveOverrideToServer(dateStr, form) {
  try {
    const client = (await import('../api/client')).default;
    await client.post('/audit/overrides', {
      date: dateStr,
      st1: form.st1 || null,
      st2: form.st2 || null,
      night: form.night || null,
      st1_hours: form.st1_hours ?? null,
      st2_hours: form.st2_hours ?? null,
      night_hours: form.night_hours ?? null,
    });
  } catch (err) {
    console.error('Failed to save override to server', err);
  }
}

export async function deleteOverrideFromServer(dateStr) {
  try {
    const client = (await import('../api/client')).default;
    await client.delete(`/audit/overrides/${dateStr}`);
  } catch (err) {
    console.error('Failed to delete override from server', err);
  }
}

export function getOperatorDaysInMonth(year, month, overrides = {}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result = {};
  ALL_OPERATORS.forEach(op => { result[op] = { st1: 0, st2: 0, night: 0 }; });

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const { pair, isVovaOn } = getShiftForDate(date, overrides);
    if (pair[0] && result[pair[0]]) result[pair[0]].st1++;
    if (pair[1] && result[pair[1]]) result[pair[1]].st2++;
    if (isVovaOn && result['Vova']) result['Vova'].night++;
  }
  return result;
}

export function computeMonthShifts(year, month, overrides = {}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const shifts = [];
  const mm = String(month + 1).padStart(2, '0');

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    const date = new Date(year, month, d);
    const { pair, isVovaOn, isOverride } = getShiftForDate(date, overrides);
    const ov = overrides[dateStr] || {};

    if (pair[0]) {
      shifts.push({
        username: pair[0],
        date: dateStr,
        shift_type: 'day',
        hours: ov.st1_hours ?? 12,
        machine_type: 'станок 1',
      });
    }
    if (pair[1]) {
      shifts.push({
        username: pair[1],
        date: dateStr,
        shift_type: 'day',
        hours: ov.st2_hours ?? 12,
        machine_type: 'станок 2',
      });
    }
    if (isVovaOn) {
      shifts.push({
        username: 'Vova',
        date: dateStr,
        shift_type: 'night',
        hours: ov.night_hours ?? 12,
        machine_type: null,
      });
    }
  }
  return shifts;
}
