exports.localDateKey = (date = new Date()) => {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Weekly holidays use JavaScript weekday numbers: Sunday=0, Saturday=6.
const weeklyHolidays = (process.env.WEEKLY_HOLIDAYS || '0,6').split(',').map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);

// Count inclusive working days, excluding configured weekly holidays.
exports.countDays = (start, end) => {
  const from = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const to = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return NaN;
  let total = 0;
  for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();
    if (!weeklyHolidays.includes(weekday)) total++;
  }
  return total;
};

exports.isWorkingDay = (date = new Date()) => !weeklyHolidays.includes(date.getDay());
