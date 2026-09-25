import os

def replace_in_file(path, old, new):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

p1 = "resources/js/pages/UserManagementPage.tsx"
replace_in_file(p1,
    "interface PermissionMatrix {\n  sidebar: string[];\n  features: Record<string, string[]>;\n  data_scope: 'all' | 'own_company';\n  project_access: Record<string, { view_project: boolean; view_progress: boolean }>;\n}",
    "interface PermissionMatrix {\n  sidebar: string[];\n  features: Record<string, string[]>;\n  data_scope: 'all' | 'own_company';\n  project_access: Record<string, { view_project: boolean; view_progress: boolean }>;\n  is_unified?: boolean;\n  per_project?: Record<string, {\n    sidebar: string[];\n    features: Record<string, string[]>;\n    data_scope: 'all' | 'own_company';\n  }>;\n}"
)

p2 = "resources/js/pages/SuperAdmin/UserManagementPage.tsx"
replace_in_file(p2,
    "interface PermissionMatrix {\n  sidebar: string[];\n  features: Record<string, string[]>;\n  data_scope: 'all' | 'own_company';\n  project_access: Record<string, { view_project: boolean; view_progress: boolean }>;\n}",
    "interface PermissionMatrix {\n  sidebar: string[];\n  features: Record<string, string[]>;\n  data_scope: 'all' | 'own_company';\n  project_access: Record<string, { view_project: boolean; view_progress: boolean }>;\n  is_unified?: boolean;\n  per_project?: Record<string, {\n    sidebar: string[];\n    features: Record<string, string[]>;\n    data_scope: 'all' | 'own_company';\n  }>;\n}"
)
