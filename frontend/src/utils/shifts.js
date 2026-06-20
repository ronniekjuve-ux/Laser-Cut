export const SHIFT_CYCLE = [
  ['Yura', 'Denis'],
  ['Andrey', 'Denis'],
  ['Andrey', 'Dima'],
  ['Yura', 'Dima'],
];
export const SHIFT_OFFSET = 1;

export const ALL_OPERATORS = ['Yura', 'Denis', 'Andrey', 'Dima', 'Vova'];

export function dateToKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getShiftInfo(date) {
  const now = new Date();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
  let dayIndex = ((diffDays + SHIFT_OFFSET) % 4 + 4) % 4;
  const pair = SHIFT_CYCLE[dayIndex];
  let nightIndex = ((diffDays + SHIFT_OFFSET) % 8 + 8) % 8;
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

export function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem('shift_overrides') || '{}');
  } catch {
    return {};
  }
}

export function saveOverrides(overrides) {
  localStorage.setItem('shift_overrides', JSON.stringify(overrides));
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
