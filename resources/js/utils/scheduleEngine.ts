import { Project, SubSubtask } from '../data/mockData';

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function recalculateSchedule(project: Project): Project {
  // Deep clone to avoid mutating the original reference directly
  const newProject = JSON.parse(JSON.stringify(project)) as Project;
  
  // 1. Build a map of all tasks and sub-tasks by code for easy lookup
  type PredTarget = { startDate: string; finishDate: string };
  const taskMap = new Map<string, PredTarget>();
  
  for (const mj of newProject.mainJobs) {
    for (const smj of mj.subMainJobs) {
      if (smj.code && smj.startDate && smj.finishDate) {
        taskMap.set(smj.code, { startDate: smj.startDate, finishDate: smj.finishDate });
        taskMap.set(smj.id, { startDate: smj.startDate, finishDate: smj.finishDate });
      }
      for (const st of smj.subtasks) {
        taskMap.set(st.code, st);
        taskMap.set(st.id, st);
      }
    }
  }

  // 2. Relaxation algorithm to resolve dependency chains
  let changed = true;
  let iterations = 0;
  const MAX_ITER = taskMap.size + 1;

  while (changed && iterations < MAX_ITER) {
    changed = false;
    iterations++;

    for (const mj of newProject.mainJobs) {
      for (const smj of mj.subMainJobs) {
        for (const st of smj.subtasks) {
          
          let newStart = st.startDate;
          let newFinish = st.finishDate;
          
          const dependencies = st.dependencies?.length
            ? st.dependencies
            : st.predecessor
              ? [{
                  predecessor_wbs_id: st.predecessor,
                  dependency_type: st.depType || 'FS',
                  lag_days: (st.lead || 0) - (st.lag || 0),
                }]
              : [];

          if (dependencies.length > 0) {
            const duration = Math.max(1, st.duration || 1);
            let requiredStart = st.startDate;

            for (const dependency of dependencies) {
              const pred = taskMap.get(dependency.predecessor_wbs_id);
              if (!pred) continue;

              const lag = 'lag_days' in dependency
                ? dependency.lag_days
                : (st.lead || 0) - (st.lag || 0);
              let requiredDate: string | null = null;

              switch (dependency.dependency_type) {
                case 'FS':
                  requiredDate = addDays(pred.finishDate, lag);
                  break;
                case 'SS':
                  requiredDate = addDays(pred.startDate, lag);
                  break;
                case 'FF':
                  requiredDate = addDays(pred.finishDate, lag - duration);
                  break;
                case 'SF':
                  requiredDate = addDays(pred.startDate, lag - duration);
                  break;
              }

              if (requiredDate && requiredDate > requiredStart) {
                requiredStart = requiredDate;
              }
            }

            newStart = requiredStart;
            newFinish = addDays(newStart, duration);
          } else {
            // No predecessor: Start date remains as user-entered.
            // Just ensure finish date is consistent with duration.
            const duration = st.duration || 1;
            newFinish = addDays(st.startDate, duration);
          }

          if (newStart !== st.startDate || newFinish !== st.finishDate) {
            st.startDate = newStart;
            st.finishDate = newFinish;
            changed = true;
            taskMap.set(st.code, st);
          }
        }
      }
    }
  }

  // 3. Roll up dates and recalculate Days Left
  const today = new Date().toISOString().slice(0, 10);

  for (const mj of newProject.mainJobs) {
    let mjStart: string | null = null;
    let mjFinish: string | null = null;

    for (const smj of mj.subMainJobs) {
      let smjStart: string | null = null;
      let smjFinish: string | null = null;

      for (const st of smj.subtasks) {
        // Update days left
        if (st.status === 'Completed' || st.checked) {
          st.daysLeft = 0;
        } else if (st.finishDate >= today) {
          const diffTime = Math.abs(new Date(st.finishDate).getTime() - new Date(today).getTime());
          st.daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
          st.daysLeft = 0; // Overdue
        }

        // Roll up to Sub Main Job
        if (!smjStart || st.startDate < smjStart) smjStart = st.startDate;
        if (!smjFinish || st.finishDate > smjFinish) smjFinish = st.finishDate;
      }
      
      if (smjStart) smj.startDate = smjStart;
      if (smjFinish) smj.finishDate = smjFinish;

      // Roll up to Main Job
      if (!mjStart || smj.startDate < mjStart) mjStart = smj.startDate;
      if (!mjFinish || smj.finishDate > mjFinish) mjFinish = smj.finishDate;
    }

    if (mjStart) mj.startDate = mjStart;
    if (mjFinish) mj.finishDate = mjFinish;
  }

  return newProject;
}
