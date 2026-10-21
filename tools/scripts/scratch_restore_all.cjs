const fs = require('fs');
const { execSync } = require('child_process');

console.log('1. Checking out clean TasksPage.tsx from git index...');
execSync('git checkout resources/js/pages/TasksPage.tsx', { stdio: 'inherit' });

const successfulEdits = JSON.parse(fs.readFileSync('successful_taskspage_edits.json', 'utf8'));

let content = fs.readFileSync('resources/js/pages/TasksPage.tsx', 'utf8');

function applyEdit(c, edit) {
  const normC = c.replace(/\r\n/g, '\n');
  const normT = edit.TargetContent.replace(/\r\n/g, '\n');
  const normR = edit.ReplacementContent.replace(/\r\n/g, '\n');
  if (normC.includes(normT)) {
    console.log('OK:', edit.Instruction);
    return normC.replace(normT, normR);
  } else {
    console.error('FAILED:', edit.Instruction);
    return normC;
  }
}

// Apply edits 0, 1, 2, 3
content = applyEdit(content, successfulEdits[0]);
content = applyEdit(content, successfulEdits[1]);
content = applyEdit(content, successfulEdits[2]);
content = applyEdit(content, successfulEdits[3]);

fs.writeFileSync('resources/js/pages/TasksPage.tsx', content);

console.log('2. Running python scratch_replace_subtask_modal.py...');
execSync('python scratch_replace_subtask_modal.py', { stdio: 'inherit' });

content = fs.readFileSync('resources/js/pages/TasksPage.tsx', 'utf8');

// Apply edits 4, 5, 6, 7, 8
content = applyEdit(content, successfulEdits[4]);
content = applyEdit(content, successfulEdits[5]);
content = applyEdit(content, successfulEdits[6]);
content = applyEdit(content, successfulEdits[7]);
content = applyEdit(content, successfulEdits[8]);

// Also type id in predecessor filter
content = content.replace(
  /\(\s*id\s*\)\s*=>\s*id\s*!==\s*t\.id/g,
  '(id: any) => id !== t.id'
);

fs.writeFileSync('resources/js/pages/TasksPage.tsx', content);
console.log('Done restoring TasksPage.tsx!');
