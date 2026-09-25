with open('resources/js/pages/SuperAdmin/UserManagementPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# The python script earlier did:
# content = content[:return_idx] + render_form_str + content[return_idx:]
# We need to find the `const renderForm = () => (` which starts at line 199.
render_form_start = content.find('      const renderForm = () => (')
if render_form_start == -1:
    render_form_start = content.find('  const renderForm = () => (')

# Find the end of renderForm which is `  );\n\n  return (\n` right before `        u.username`
render_form_end = content.find('  );\n\n  return (\n        u.username', render_form_start)

if render_form_start != -1 and render_form_end != -1:
    # Extract renderForm string
    render_form_str = content[render_form_start:render_form_end + 5] # includes `  );\n\n`
    
    # Remove it from its current position
    content = content[:render_form_start] + content[render_form_end + 5:]
    
    # Now find the REAL `  return (\n    <SuperAdminLayout>`
    real_return_idx = content.find('  return (\n    <SuperAdminLayout>')
    
    # Insert renderForm right before real_return_idx
    content = content[:real_return_idx] + render_form_str + content[real_return_idx:]
    
    with open('resources/js/pages/SuperAdmin/UserManagementPage.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed!")
else:
    print("Could not find renderForm block")
