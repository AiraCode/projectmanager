import { Project, WeekData } from '../data/mockData';

function parseUtcDate(dateStr: string): number {
  if (!dateStr) return NaN;
  const parts = dateStr.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function getDaysDiffInclusive(startMs: number, endMs: number): number {
  return Math.round((endMs - startMs) / 86400000) + 1;
}

function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysUtc(dateStr: string, days: number): string {
  const ms = parseUtcDate(dateStr);
  if (isNaN(ms)) return dateStr;
  return formatUtcDate(ms + days * 86400000);
}

interface SchedulableItem {
  id: string;
  name: string;
  weight: number;
  startDate: string;
  finishDate: string;
}

export function recalculateWeeklyData(project: Project): Project {
  // Deep clone
  const newProject = JSON.parse(JSON.stringify(project)) as Project;
  
  // 1. Determine overall project start and end dates based on all tasks
  let minDateStr = newProject.startDate || '';
  let maxDateStr = newProject.endDate || '';

  newProject.mainJobs?.forEach(mj => {
    // If mj missing start/finish, look into children
    if (!mj.startDate || !mj.finishDate) {
      let minS = mj.startDate;
      let maxF = mj.finishDate;
      mj.subMainJobs?.forEach(smj => {
        if (smj.startDate && (!minS || smj.startDate < minS)) minS = smj.startDate;
        if (smj.finishDate && (!maxF || smj.finishDate > maxF)) maxF = smj.finishDate;
        smj.subtasks?.forEach(st => {
          if (st.startDate && (!minS || st.startDate < minS)) minS = st.startDate;
          if (st.finishDate && (!maxF || st.finishDate > maxF)) maxF = st.finishDate;
        });
      });
      if (!mj.startDate && minS) mj.startDate = minS;
      if (!mj.finishDate && maxF) mj.finishDate = maxF;
    }

    if (mj.startDate && (!minDateStr || mj.startDate < minDateStr)) minDateStr = mj.startDate;
    if (mj.finishDate && (!maxDateStr || mj.finishDate > maxDateStr)) maxDateStr = mj.finishDate;
  });

  if (!minDateStr) minDateStr = new Date().toISOString().slice(0, 10);
  if (!maxDateStr || maxDateStr < minDateStr) maxDateStr = addDaysUtc(minDateStr, 6);

  newProject.startDate = minDateStr;
  newProject.endDate = maxDateStr;

  // 2. Generate Week boundaries
  const weeks: { week: number; startDate: string; endDate: string }[] = [];
  let currentStart = minDateStr;
  let weekNum = 1;
  
  // Create weeks until we cover maxDateStr
  while (currentStart <= maxDateStr) {
    const currentEnd = addDaysUtc(currentStart, 6); // 7 days inclusive
    weeks.push({
      week: weekNum,
      startDate: currentStart,
      endDate: currentEnd,
    });
    currentStart = addDaysUtc(currentEnd, 1);
    weekNum++;
  }

  // 3. Extract Schedulable Leaf Items with Daily Rate ("Dibagi Hari")
  const schedulableItems: SchedulableItem[] = [];

  newProject.mainJobs?.forEach(mj => {
    const mjWeight = Number(mj.weight) || 0;
    if (mjWeight <= 0) return;

    let hasSubItems = false;
    const subItems: SchedulableItem[] = [];

    mj.subMainJobs?.forEach(smj => {
      let hasTaskItems = false;
      const taskItems: SchedulableItem[] = [];

      smj.subtasks?.forEach(st => {
        if (st.startDate && st.finishDate) {
          taskItems.push({
            id: st.id,
            name: st.name,
            weight: Number(st.weight) || 0,
            startDate: st.startDate,
            finishDate: st.finishDate,
          });
          hasTaskItems = true;
        }
      });

      if (hasTaskItems && taskItems.length > 0) {
        const smjWeight = Number(smj.weight) || (mjWeight / Math.max(1, mj.subMainJobs?.length || 1));
        const rawTaskSum = taskItems.reduce((sum, t) => sum + t.weight, 0);
        const norm = rawTaskSum > 0 ? (smjWeight / rawTaskSum) : (smjWeight / taskItems.length);

        taskItems.forEach(t => {
          subItems.push({
            ...t,
            weight: rawTaskSum > 0 ? t.weight * norm : norm,
          });
        });
        hasSubItems = true;
      } else if (smj.startDate && smj.finishDate) {
        subItems.push({
          id: smj.id,
          name: smj.name,
          weight: Number(smj.weight) || (mjWeight / Math.max(1, mj.subMainJobs?.length || 1)),
          startDate: smj.startDate,
          finishDate: smj.finishDate,
        });
        hasSubItems = true;
      }
    });

    if (hasSubItems && subItems.length > 0) {
      const rawSubSum = subItems.reduce((sum, s) => sum + s.weight, 0);
      const norm = rawSubSum > 0 ? (mjWeight / rawSubSum) : (mjWeight / subItems.length);
      subItems.forEach(s => {
        schedulableItems.push({
          ...s,
          weight: rawSubSum > 0 ? s.weight * norm : norm,
        });
      });
    } else if (mj.startDate && mj.finishDate) {
      schedulableItems.push({
        id: mj.id,
        name: mj.name,
        weight: mjWeight,
        startDate: mj.startDate,
        finishDate: mj.finishDate,
      });
    }
  });

  // Normalize across all items so total weight is exactly 100.0%
  const totalRawWeight = schedulableItems.reduce((sum, item) => sum + item.weight, 0);
  const globalNorm = totalRawWeight > 0 ? (100.0 / totalRawWeight) : 1.0;

  schedulableItems.forEach(item => {
    item.weight = item.weight * globalNorm;
  });

  // Identify current week index based on today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  let currentWeekIdx = weeks.findIndex(w => todayStr >= w.startDate && todayStr <= w.endDate);
  if (currentWeekIdx === -1) {
    if (weeks.length > 0 && todayStr < weeks[0].startDate) {
      currentWeekIdx = 0;
    } else {
      currentWeekIdx = Math.max(0, weeks.length - 1);
    }
  }

  // Check if explicit weekly actual entries exist in DB
  const savedActuals = (newProject as any).savedWeeklyActuals || {};
  const hasSavedActuals = Object.keys(savedActuals).some(
    k => savedActuals[k] !== undefined && savedActuals[k] !== null && Number(savedActuals[k]) > 0
  );

  const overallActual = Number(newProject.overallProgress || 0);

  // 4. Distribute Planned Progress across weeks (Pure Daily Division + Telescoping Delta)
  const weeklyData: WeekData[] = [];
  let rawCumulative = 0;
  let prevPlannedCum = 0;
  let actualCumulative = 0;

  weeks.forEach((w, idx) => {
    let weekPlannedRaw = 0;
    const wStartMs = parseUtcDate(w.startDate);
    const wEndMs = parseUtcDate(w.endDate);

    schedulableItems.forEach(item => {
      const itemStartMs = parseUtcDate(item.startDate);
      const itemEndMs = parseUtcDate(item.finishDate);
      if (isNaN(itemStartMs) || isNaN(itemEndMs) || itemStartMs > itemEndMs) return;

      const itemDurationDays = getDaysDiffInclusive(itemStartMs, itemEndMs);
      if (itemDurationDays <= 0) return;

      const overlapStartMs = Math.max(itemStartMs, wStartMs);
      const overlapEndMs = Math.min(itemEndMs, wEndMs);

      if (overlapStartMs <= overlapEndMs) {
        const overlapDays = getDaysDiffInclusive(overlapStartMs, overlapEndMs);
        if (overlapDays > 0) {
          // Bobot dibagi hari dikali jumlah hari aktif dalam minggu ini
          const dailyRate = item.weight / itemDurationDays;
          weekPlannedRaw += dailyRate * overlapDays;
        }
      }
    });

    rawCumulative += weekPlannedRaw;

    let plannedCumulative = 0;
    let weekPlanned = 0;

    if (idx === weeks.length - 1) {
      plannedCumulative = 100.00;
      weekPlanned = parseFloat(Math.max(0, 100.00 - prevPlannedCum).toFixed(2));
    } else {
      plannedCumulative = parseFloat(Math.min(100.00, Math.round(rawCumulative * 100) / 100).toFixed(2));
      weekPlanned = parseFloat(Math.max(0, plannedCumulative - prevPlannedCum).toFixed(2));
    }
    prevPlannedCum = plannedCumulative;

    // Determine actual progress for this week:
    let actualValue = 0;
    const isElapsed = idx <= currentWeekIdx;

    if (hasSavedActuals) {
      const existingWeek = newProject.weeklyData?.find(ew => ew.week === w.week);
      const saved = savedActuals[w.week];
      actualValue = saved !== undefined ? Number(saved) : (existingWeek?.actual || 0);
      actualCumulative += actualValue;
      actualCumulative = Math.min(100, parseFloat(actualCumulative.toFixed(2)));
    } else if (isElapsed && overallActual > 0) {
      const targetCumulative = parseFloat(
        Math.min(overallActual, (((idx + 1) / (currentWeekIdx + 1)) * overallActual)).toFixed(2)
      );
      actualValue = parseFloat(Math.max(0, targetCumulative - actualCumulative).toFixed(2));
      actualCumulative = targetCumulative;
    } else {
      actualValue = 0;
    }

    weeklyData.push({
      week: w.week,
      startDate: w.startDate,
      endDate: w.endDate,
      planned: weekPlanned,
      actual: isElapsed ? actualValue : 0,
      plannedCumulative,
      actualCumulative: isElapsed ? actualCumulative : 0,
    });
  });

  newProject.weeklyData = weeklyData;
  return newProject;
}
