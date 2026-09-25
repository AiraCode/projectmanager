import re
import sys

try:
    with open('resources/js/pages/SuperAdmin/UserManagementPage.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract the form
    form_start_idx = content.find('<form onSubmit={handleSubmit} className="p-6 space-y-5">')
    form_end_idx = content.find('</form>', form_start_idx) + len('</form>')

    if form_start_idx != -1 and form_end_idx != -1:
        form_content = content[form_start_idx:form_end_idx]
        
        # modify cancel button inside form to handle viewMode
        form_content = form_content.replace(
            "onClick={() => setModalOpen(false)}",
            "onClick={() => { if (viewMode === 'create') { setViewMode('manage'); reset(); } else { setModalOpen(false); } }}"
        )

        # create renderForm function
        render_form_str = f"  const renderForm = () => (\n    {form_content}\n  );\n\n"
        
        # insert before return (
        return_idx = content.find('  return (\n')
        
        content = content[:return_idx] + render_form_str + content[return_idx:]
        
        # Now replace the old modal block
        old_modal_start = content.find('{/* Create / Edit Modal */}')
        old_modal_end = content.find('{/* Toast */}', old_modal_start)
        
        new_ui = """      {/* Manage Mode vs Create Mode */}
          </>
        ) : (
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}>
            <div className="mb-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">Create New User</h2>
              <p className="text-neutral-500 text-[13px]">Fill in the details below to create a new user account.</p>
            </div>
            {renderForm()}
          </div>
        )}
      </div>

      {/* Edit Modal (Only in manage mode when editing) */}
      {modalOpen && viewMode === 'manage' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-black text-[16px] text-neutral-900">
                {editUser ? `Edit User: ${editUser.username}` : 'Create New User'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">✕</button>
            </div>
            {renderForm()}
          </div>
        </div>
      )}

      """
        content = content[:old_modal_start] + new_ui + content[old_modal_end:]
        
        with open('resources/js/pages/SuperAdmin/UserManagementPage.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Refactor successful.")
    else:
        print("Could not find form")
except Exception as e:
    print(f"Error: {e}")
