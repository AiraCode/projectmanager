import re

p1 = "resources/js/pages/UserManagementPage.tsx"
with open(p1, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add activeMatrixTab state
state_var = "  const [filterCompany, setFilterCompany] = useState('');\n  const [activeMatrixTab, setActiveMatrixTab] = useState<string | null>(null);"
content = content.replace("  const [filterCompany, setFilterCompany] = useState('');", state_var)

# 2. Modify handleUnifiedViewToggle
old_unified_toggle = """  const handleUnifiedViewToggle = (mod: typeof MODULE_PERMISSIONS[0]) => {
    const currentSidebar = data.permission_matrix.sidebar || [];
    const isCurrentlyView = currentSidebar.includes(mod.sidebarKey);
    
    const updatedSidebar = isCurrentlyView 
      ? currentSidebar.filter(s => s !== mod.sidebarKey)
      : [...currentSidebar, mod.sidebarKey];

    let updatedFeatures = { ...(data.permission_matrix.features || {}) };
    if (mod.featureGroup) {
      const currentActions = updatedFeatures[mod.featureGroup] || [];
      if (isCurrentlyView) {
        // Remove 'view'
        updatedFeatures[mod.featureGroup] = currentActions.filter(a => a !== 'view');
      } else {
        // Add 'view'
        updatedFeatures[mod.featureGroup] = [...currentActions.filter(a => a !== 'view'), 'view'];
      }
    }

    setData('permission_matrix', { 
      ...data.permission_matrix, 
      sidebar: updatedSidebar,
      features: updatedFeatures
    });
  };"""

new_unified_toggle = """  const handleUnifiedViewToggle = (mod: typeof MODULE_PERMISSIONS[0]) => {
    const targetMatrix = activeMatrixTab 
      ? ((data.permission_matrix.per_project && data.permission_matrix.per_project[activeMatrixTab]) || { sidebar: [], features: {}, data_scope: 'own_company' })
      : data.permission_matrix;

    const currentSidebar = targetMatrix.sidebar || [];
    const isCurrentlyView = currentSidebar.includes(mod.sidebarKey);
    
    const updatedSidebar = isCurrentlyView 
      ? currentSidebar.filter((s: string) => s !== mod.sidebarKey)
      : [...currentSidebar, mod.sidebarKey];

    let updatedFeatures = { ...(targetMatrix.features || {}) };
    if (mod.featureGroup) {
      const currentActions = updatedFeatures[mod.featureGroup] || [];
      if (isCurrentlyView) {
        updatedFeatures[mod.featureGroup] = currentActions.filter((a: string) => a !== 'view');
      } else {
        updatedFeatures[mod.featureGroup] = [...currentActions.filter((a: string) => a !== 'view'), 'view'];
      }
    }

    if (activeMatrixTab) {
      setData('permission_matrix', {
        ...data.permission_matrix,
        per_project: {
          ...(data.permission_matrix.per_project || {}),
          [activeMatrixTab]: {
            ...targetMatrix,
            sidebar: updatedSidebar,
            features: updatedFeatures
          }
        }
      });
    } else {
      setData('permission_matrix', { 
        ...data.permission_matrix, 
        sidebar: updatedSidebar,
        features: updatedFeatures
      });
    }
  };"""

content = content.replace(old_unified_toggle, new_unified_toggle)

# 3. Modify handleFeatureToggle
old_feature_toggle = """  const handleFeatureToggle = (feature: string, action: string) => {
    const currentFeat = data.permission_matrix.features || {};
    const currentActions = currentFeat[feature] || [];
    const updatedActions = currentActions.includes(action) ? currentActions.filter(a => a !== action) : [...currentActions, action];
    setData('permission_matrix', { ...data.permission_matrix, features: { ...currentFeat, [feature]: updatedActions } });
  };"""

new_feature_toggle = """  const handleFeatureToggle = (feature: string, action: string) => {
    const targetMatrix = activeMatrixTab 
      ? ((data.permission_matrix.per_project && data.permission_matrix.per_project[activeMatrixTab]) || { sidebar: [], features: {}, data_scope: 'own_company' })
      : data.permission_matrix;

    const currentFeat = targetMatrix.features || {};
    const currentActions = currentFeat[feature] || [];
    const updatedActions = currentActions.includes(action) ? currentActions.filter((a: string) => a !== action) : [...currentActions, action];
    
    if (activeMatrixTab) {
      setData('permission_matrix', {
        ...data.permission_matrix,
        per_project: {
          ...(data.permission_matrix.per_project || {}),
          [activeMatrixTab]: {
            ...targetMatrix,
            features: { ...currentFeat, [feature]: updatedActions }
          }
        }
      });
    } else {
      setData('permission_matrix', { ...data.permission_matrix, features: { ...currentFeat, [feature]: updatedActions } });
    }
  };"""

content = content.replace(old_feature_toggle, new_feature_toggle)


# 4. Modify rendering of Global Permission Matrix
render_setup = """  const showDivision = selectedRoleName === 'worker' || selectedRoleName === 'worker_b';"""

new_render_setup = """  const showDivision = selectedRoleName === 'worker' || selectedRoleName === 'worker_b';
  
  const activeProjects = Object.entries(data.permission_matrix.project_access || {})
    .filter(([_, access]) => access.view_project)
    .map(([id]) => (projects || []).find(p => p.id.toString() === id))
    .filter(Boolean) as Project[];
  
  const isUnified = data.permission_matrix.is_unified !== false;
  
  const currentMatrixData = activeMatrixTab 
    ? ((data.permission_matrix.per_project && data.permission_matrix.per_project[activeMatrixTab]) || { sidebar: [], features: {}, data_scope: 'own_company' })
    : data.permission_matrix;
"""
content = content.replace(render_setup, new_render_setup)

# 5. Insert unified toggle UI
matrix_trigger = """      {showGlobalMatrix && ("""

new_matrix_trigger = """      {showGlobalMatrix && isWorkerTarget && activeProjects.length > 1 && (
        <div className="border border-neutral-200 rounded-xl overflow-hidden mt-4 p-4 bg-neutral-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[13px] text-neutral-800">Unified Permission Settings</h3>
            <p className="text-[11.5px] text-neutral-500">Apply the same permissions across all assigned projects, or configure them individually.</p>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-bold text-neutral-800 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isUnified}
              onChange={(e) => {
                setData('permission_matrix', { ...data.permission_matrix, is_unified: e.target.checked });
                if (e.target.checked) setActiveMatrixTab(null);
              }}
              className="rounded text-brand focus:ring-brand w-4 h-4"
            />
            Samakan semua settingan permission
          </label>
        </div>
      )}
      
      {showGlobalMatrix && (!isUnified && activeProjects.length > 1) && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          {activeProjects.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setActiveMatrixTab(p.id.toString()); setIsGlobalMatrixOpen(true); }}
              className={`px-4 py-2 rounded-lg font-bold text-[12px] whitespace-nowrap transition-colors ${activeMatrixTab === p.id.toString() ? 'bg-brand text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
            >
              Matrix - {p.title}
            </button>
          ))}
        </div>
      )}

      {showGlobalMatrix && (isUnified || activeProjects.length <= 1 || activeMatrixTab) && ("""

content = content.replace(matrix_trigger, new_matrix_trigger)

# 6. Adjust 'data.permission_matrix.sidebar' reading in the table to use 'currentMatrixData'
content = content.replace("checked={data.permission_matrix.data_scope === 'all'}", "checked={currentMatrixData.data_scope === 'all'}")
content = content.replace("setData('permission_matrix', { ...data.permission_matrix, data_scope: 'all' })", "setData('permission_matrix', activeMatrixTab ? { ...data.permission_matrix, per_project: { ...(data.permission_matrix.per_project || {}), [activeMatrixTab]: { ...currentMatrixData, data_scope: 'all' } } } : { ...data.permission_matrix, data_scope: 'all' })")
content = content.replace("checked={data.permission_matrix.data_scope === 'own_company'}", "checked={currentMatrixData.data_scope === 'own_company'}")
content = content.replace("setData('permission_matrix', { ...data.permission_matrix, data_scope: 'own_company' })", "setData('permission_matrix', activeMatrixTab ? { ...data.permission_matrix, per_project: { ...(data.permission_matrix.per_project || {}), [activeMatrixTab]: { ...currentMatrixData, data_scope: 'own_company' } } } : { ...data.permission_matrix, data_scope: 'own_company' })")

content = content.replace("const isView = (data.permission_matrix.sidebar || []).includes(mod.sidebarKey);", "const isView = (currentMatrixData.sidebar || []).includes(mod.sidebarKey);")
content = content.replace("(data.permission_matrix.features?.[mod.featureGroup] || []).includes(feat)", "(currentMatrixData.features?.[mod.featureGroup] || []).includes(feat)")

content = content.replace("<h3 className=\"font-bold text-[13px]\">Global Permission Matrix</h3>", "<h3 className=\"font-bold text-[13px]\">{activeMatrixTab ? `Permission Matrix - ${activeProjects.find(p => p.id.toString() === activeMatrixTab)?.title}` : 'Global Permission Matrix'}</h3>")

with open(p1, 'w', encoding='utf-8') as f:
    f.write(content)

