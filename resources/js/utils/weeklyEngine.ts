import { Project, WeekData } from '../data/mockData';

export function parseUtcDate(dateStr: string): number {
  if (!dateStr) return NaN;
  const parts = dateStr.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

export function getDaysDiffInclusive(startMs: number, endMs: number): number {
  return Math.round((endMs - startMs) / 86400000) + 1;
}

export function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysUtc(dateStr: string, days: number): string {
  const ms = parseUtcDate(dateStr);
  if (isNaN(ms)) return dateStr;
  return formatUtcDate(ms + days * 86400000);
}

export interface SchedulableItem {
  id: string;
  name: string;
  weight: number;
  startDate: string;
  finishDate: string;
  progress: number;
  actualEarned: number;
}

export interface DailyPoint {
  date: string;
  week: number;
  planned: number;
  actual: number | null;
  plannedCumulative: number;
  actualCumulative: number | null;
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

  // 3. Extract Schedulable Leaf Items with Weight and Real Progress
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
          const stProg = st.progress !== undefined && st.progress !== null
            ? Number(st.progress)
            : (st.checked || st.status === 'Completed' ? 100 : 0);
          const effectiveProg = (st.checked || st.status === 'Completed' || stProg >= 100)
            ? 100
            : Math.max(0, Math.min(100, stProg));

          taskItems.push({
            id: st.id,
            name: st.name,
            weight: Number(st.weight) || 0,
            startDate: st.startDate,
            finishDate: st.finishDate,
            progress: effectiveProg,
            actualEarned: 0,
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
        const smjProg = smj.progress !== undefined && smj.progress !== null
          ? Number(smj.progress)
          : (smj.status === 'Completed' ? 100 : 0);
        const effectiveProg = (smj.status === 'Completed' || smjProg >= 100)
          ? 100
          : Math.max(0, Math.min(100, smjProg));

        subItems.push({
          id: smj.id,
          name: smj.name,
          weight: Number(smj.weight) || (mjWeight / Math.max(1, mj.subMainJobs?.length || 1)),
          startDate: smj.startDate,
          finishDate: smj.finishDate,
          progress: effectiveProg,
          actualEarned: 0,
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
      const mjProg = mj.progress !== undefined && mj.progress !== null
        ? Number(mj.progress)
        : (mj.status === 'Completed' ? 100 : 0);
      const effectiveProg = (mj.status === 'Completed' || mjProg >= 100)
        ? 100
        : Math.max(0, Math.min(100, mjProg));

      schedulableItems.push({
        id: mj.id,
        name: mj.name,
        weight: mjWeight,
        startDate: mj.startDate,
        finishDate: mj.finishDate,
        progress: effectiveProg,
        actualEarned: 0,
      });
    }
  });

  // Normalize across all items so total weight is exactly 100.0%
  const totalRawWeight = schedulableItems.reduce((sum, item) => sum + item.weight, 0);
  const globalNorm = totalRawWeight > 0 ? (100.0 / totalRawWeight) : 1.0;

  schedulableItems.forEach(item => {
    item.weight = item.weight * globalNorm;
    item.actualEarned = (item.progress / 100) * item.weight;
  });

  const totalCalculatedActual = schedulableItems.reduce((sum, item) => sum + item.actualEarned, 0);

  // Check if explicit manual weekly actual entries exist in DB
  const savedActuals = (newProject as any).savedWeeklyActuals || {};
  const hasSavedActuals = Object.keys(savedActuals).some(
    k => savedActuals[k] !== undefined && savedActuals[k] !== null && Number(savedActuals[k]) > 0
  );

  const overallActual = hasSavedActuals
    ? Number(newProject.overallProgress || 0)
    : Math.round(totalCalculatedActual * 100) / 100;

  newProject.overallProgress = overallActual;

  // Identify current week index based on today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs = parseUtcDate(todayStr);

  let currentWeekIdx = weeks.findIndex(w => todayStr >= w.startDate && todayStr <= w.endDate);
  if (currentWeekIdx === -1) {
    if (weeks.length > 0 && todayStr < weeks[0].startDate) {
      currentWeekIdx = 0;
    } else {
      currentWeekIdx = Math.max(0, weeks.length - 1);
    }
  }

  // 4. Generate High-Resolution Daily Data
  const dailyData: DailyPoint[] = [];
  let curMs = parseUtcDate(minDateStr);
  const endMs = parseUtcDate(maxDateStr);
  let rawPlanDailyCum = 0;
  let rawActDailyCum = 0;

  while (curMs <= endMs && dailyData.length < 2000) {
    const curStr = formatUtcDate(curMs);
    const wIdx = weeks.findIndex(w => curStr >= w.startDate && curStr <= w.endDate);
    const weekNum = wIdx !== -1 ? weeks[wIdx].week : 1;

    let dayPlanRaw = 0;
    let dayActRaw = 0;
    const isPastOrToday = curMs <= todayMs;

    schedulableItems.forEach(item => {
      const iStartMs = parseUtcDate(item.startDate);
      const iEndMs = parseUtcDate(item.finishDate);
      if (curMs >= iStartMs && curMs <= iEndMs) {
        const dur = getDaysDiffInclusive(iStartMs, iEndMs);
        if (dur > 0) dayPlanRaw += item.weight / dur;
      }

      if (isPastOrToday && item.actualEarned > 0) {
        let aStart = iStartMs;
        let aEnd = iEndMs;
        if (iEndMs <= todayMs) {
          aStart = iStartMs;
          aEnd = iEndMs;
        } else if (iStartMs <= todayMs) {
          aStart = iStartMs;
          aEnd = todayMs;
        } else {
          aStart = todayMs;
          aEnd = todayMs;
        }
        if (curMs >= aStart && curMs <= aEnd) {
          const aDur = getDaysDiffInclusive(aStart, aEnd);
          if (aDur > 0) dayActRaw += item.actualEarned / aDur;
        }
      }
    });

    rawPlanDailyCum += dayPlanRaw;
    const planCum = parseFloat(Math.min(100, Math.round(rawPlanDailyCum * 100) / 100).toFixed(2));
    const dayPlan = parseFloat(Math.round(dayPlanRaw * 100) / 100);

    let actCum: number | null = null;
    let dayAct: number | null = null;

    if (isPastOrToday) {
      rawActDailyCum += dayActRaw;
      actCum = parseFloat(Math.min(100, Math.round(rawActDailyCum * 100) / 100).toFixed(2));
      dayAct = parseFloat(Math.round(dayActRaw * 100) / 100);
    }

    dailyData.push({
      date: curStr,
      week: weekNum,
      planned: dayPlan,
      actual: dayAct,
      plannedCumulative: planCum,
      actualCumulative: actCum,
    });

    curMs += 86400000;
  }

  // 5. Generate Weekly Progress Data
  const weeklyData: WeekData[] = [];
  let prevPlannedCum = 0;
  let manualActCum = 0;

  weeks.forEach((w, idx) => {
    const isElapsed = idx <= currentWeekIdx;
    const daysInWeek = dailyData.filter(d => d.date >= w.startDate && d.date <= w.endDate);

    let weekPlanned = 0;
    let plannedCumulative = 0;

    if (idx === weeks.length - 1) {
      plannedCumulative = 100.00;
      weekPlanned = parseFloat(Math.max(0, 100.00 - prevPlannedCum).toFixed(2));
    } else {
      const lastDay = daysInWeek[daysInWeek.length - 1];
      plannedCumulative = lastDay ? lastDay.plannedCumulative : prevPlannedCum;
      weekPlanned = parseFloat(Math.max(0, plannedCumulative - prevPlannedCum).toFixed(2));
    }
    prevPlannedCum = plannedCumulative;

    let weekActual = 0;
    let actualCumulative = 0;

    if (hasSavedActuals) {
      const existingWeek = newProject.weeklyData?.find(ew => ew.week === w.week);
      const saved = savedActuals[w.week];
      weekActual = saved !== undefined ? Number(saved) : (existingWeek?.actual || 0);
      manualActCum += weekActual;
      actualCumulative = isElapsed ? Math.min(100, parseFloat(manualActCum.toFixed(2))) : 0;
    } else if (isElapsed) {
      const elapsedDays = daysInWeek.filter(d => d.actual !== null);
      weekActual = parseFloat(elapsedDays.reduce((sum, d) => sum + (d.actual || 0), 0).toFixed(2));
      const lastElapsedDay = elapsedDays[elapsedDays.length - 1];
      actualCumulative = lastElapsedDay && lastElapsedDay.actualCumulative !== null
        ? lastElapsedDay.actualCumulative
        : 0;
    } else {
      weekActual = 0;
      actualCumulative = 0;
    }

    weeklyData.push({
      week: w.week,
      startDate: w.startDate,
      endDate: w.endDate,
      planned: weekPlanned,
      actual: isElapsed ? weekActual : 0,
      plannedCumulative,
      actualCumulative: isElapsed ? actualCumulative : 0,
    });
  });

  newProject.weeklyData = weeklyData;
  (newProject as any).dailyData = dailyData;
  return newProject;
}
