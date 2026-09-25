import { Project, Status } from '../data/mockData';

function getStatusFromProgress(progress: number, currentStatus: Status): Status {
  if (progress === 100) return 'Completed';
  if (progress > 0 && currentStatus === 'Open') return 'On Track';
  if (progress === 0 && currentStatus === 'Completed') return 'Open';
  return currentStatus;
}

export function recalculateProgress(project: Project): Project {
  // Deep clone to avoid mutating the original reference directly
  const newProject = JSON.parse(JSON.stringify(project)) as Project;

  if (!newProject.mainJobs || newProject.mainJobs.length === 0) {
    newProject.overallProgress = 0;
    newProject.status = 'Open';
    return newProject;
  }

  let totalProjectWeight = 0;
  let totalProjectWeightedProgress = 0;

  for (const mj of newProject.mainJobs) {
    const mjWeight = Number(mj.weight) || 0;
    const subCount = mj.subMainJobs?.length || 0;

    let totalMjWeight = 0;
    let totalMjWeightedProgress = 0;

    for (const smj of mj.subMainJobs) {
      // 1. Hierarchically recalculate Sub Task weight from Main Task
      if (subCount > 0) {
        smj.weight = Math.round((mjWeight / subCount) * 100) / 100;
      } else {
        smj.weight = 0;
      }
      const smjWeight = smj.weight || 0;

      // 2. Hierarchically recalculate Sub-Subtask weight from Sub Task
      const taskCount = smj.subtasks?.length || 0;
      if (taskCount > 0 && smj.subtasks) {
        const taskWeight = Math.round((smjWeight / taskCount) * 100) / 100;
        smj.subtasks.forEach(st => {
          st.weight = taskWeight;
        });
      }

      // 3. Calculate SMJ Progress based on Sub-Subtasks
      if (smj.subtasks && smj.subtasks.length > 0) {
        const totalTaskWeight = smj.subtasks.reduce((acc, st) => acc + (Number(st.weight) || 0), 0);
        if (totalTaskWeight > 0) {
          const weightedProgress = smj.subtasks
            .reduce((acc, st) => acc + ((Number(st.progress) || 0) / 100) * (Number(st.weight) || 0), 0);
          smj.progress = Math.round((weightedProgress / totalTaskWeight) * 100);
        } else {
          const totalProgress = smj.subtasks.reduce((acc, st) => acc + (Number(st.progress) || 0), 0);
          smj.progress = Math.round(totalProgress / smj.subtasks.length);
        }

        // Also update individual subtask status
        smj.subtasks.forEach(st => {
          st.checked = st.progress >= 100;
          st.status = getStatusFromProgress(st.progress, st.status);
        });
      } else {
        smj.progress = 0;
      }

      smj.status = getStatusFromProgress(smj.progress, smj.status);

      // Accumulate for Main Job
      totalMjWeight += smjWeight;
      totalMjWeightedProgress += (smj.progress * smjWeight);
    }

    // 4. Calculate Main Job Progress based on Sub Main Jobs
    if (totalMjWeight > 0) {
      mj.progress = Math.round(totalMjWeightedProgress / totalMjWeight);
    } else {
      mj.progress = 0;
    }

    mj.status = getStatusFromProgress(mj.progress, mj.status);

    // Accumulate for Overall Project
    totalProjectWeight += mjWeight;
    totalProjectWeightedProgress += (mj.progress * mjWeight);
  }

  // 5. Calculate Overall Project Progress
  if (totalProjectWeight > 0) {
    newProject.overallProgress = Math.round(totalProjectWeightedProgress / totalProjectWeight);
  } else {
    newProject.overallProgress = 0;
  }

  newProject.status = getStatusFromProgress(newProject.overallProgress, newProject.status);

  return newProject;
}
