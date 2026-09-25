import re
import json

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the Global Permission Matrix section
    start_str = '{showGlobalMatrix && ('
    
    # We will replace the entire Global Matrix block
    # Instead of complex regex, let's just insert the activeProjects definition inside the render body
    
    # Insert activeProjects calculation before return
    active_projects_code = """
  const activeProjects = Object.entries(data.permission_matrix.project_access || {})
    .filter(([_, access]) => access.view_project)
    .map(([id]) => (projects || []).find(p => p.id.toString() === id))
    .filter(Boolean) as Project[];
  
  const isUnified = data.permission_matrix.is_unified !== false;
"""
    if "const activeProjects =" not in content:
        content = content.replace("return (", active_projects_code + "\n  return (", 1)

    # Now replace the matrix block logic
    # We can replace the existing Matrix block with a reusable Component? No, let's just render inline
    
    # Actually, modifying the React file directly via python replace is risky.
    pass

if __name__ == '__main__':
    print("Done")
