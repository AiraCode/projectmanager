<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Division;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;

class UserManagementController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        // Security check: Only SuperAdmin and PIC can access User Management
        if (!$user->hasSidebarAccess('User Management') && $user->role?->name !== 'SuperAdmin' && $user->role?->name !== 'pic') {
            abort(403, 'Unauthorized access.');
        }

        $query = User::with(['role', 'company', 'companies', 'division']);

        // Data Scope: If not SuperAdmin (or data_scope != all), restrict to own company
        if ($user->getDataScope() !== 'all') {
            $userCompanyIds = $user->getCompanyIds();
            $query->where(function($q) use ($userCompanyIds) {
                $q->whereIn('companies_id', $userCompanyIds)
                  ->orWhereHas('companies', function($cq) use ($userCompanyIds) {
                      $cq->whereIn('companies.id', $userCompanyIds);
                  });
            });
        }

        $users = $query->get()->map(function($u) {
            $u->company_ids = $u->getCompanyIds();
            return $u;
        });

        $companies = Company::all();
        $divisions = Division::all();
        $roles = Role::all();
        
        $projects = [];
        if ($user->role?->name === 'pic') {
            $userCompanyIds = $user->getCompanyIds();
            $projects = \App\Models\Project::where(function($q) use ($user, $userCompanyIds) {
                if (!empty($userCompanyIds)) {
                    $q->whereIn('companies_id', $userCompanyIds);
                }
                $q->orWhere('project_manager', $user->id);
            })->select('id', 'title')->get();
        }

        return Inertia::render('UserManagementPage', [
            'users' => $users,
            'companies' => $companies,
            'divisions' => $divisions,
            'roles' => $roles,
            'projects' => $projects,
            'currentUser' => $user->load(['role', 'company', 'companies']),
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        if ($request->filled('email')) {
            $email = trim($request->email);
            if (!str_contains($email, '@')) {
                $email .= '@provis.id';
            }
            $request->merge(['email' => strtolower($email)]);
        } elseif ($request->filled('username')) {
            $prefix = strtolower(preg_replace('/[^a-zA-Z0-9._-]/', '', str_replace(' ', '.', trim($request->username))));
            $request->merge(['email' => $prefix . '@provis.id']);
        }
        
        $request->validate([
            'username' => 'required|string|max:45',
            'email' => 'required|string|email|max:45|unique:users',
            'password' => 'required|string|min:8|regex:/[a-zA-Z]/|regex:/[0-9]/',
            'roles_id' => 'required|integer|exists:roles,id',
            'companies_id' => 'nullable|integer|exists:companies,id',
            'company_ids' => 'nullable|array',
            'company_ids.*' => 'integer|exists:companies,id',
            'multi_company_agreement' => 'nullable|boolean',
            'divisions_id' => 'nullable|integer|exists:divisions,id',
            'permission_matrix' => 'nullable|array',
        ]);

        $companyIds = [];
        if ($request->has('company_ids')) {
            $companyIds = array_values(array_unique(array_filter(array_map('intval', (array) $request->input('company_ids', [])))));
        } elseif ($request->filled('companies_id')) {
            $companyIds = [(int) $request->input('companies_id')];
        }

        // Enforcement: Only SuperAdmin can assign multiple companies, and must tick agreement checkbox
        if (count($companyIds) > 1) {
            if ($user->role?->name !== 'SuperAdmin') {
                abort(403, 'Hanya Super Admin yang diizinkan memberikan lebih dari 1 company.');
            }

            if (!$request->boolean('multi_company_agreement')) {
                return back()->withErrors([
                    'multi_company_agreement' => 'Persetujuan Super Admin wajib dicentang sebelum memberikan lebih dari 1 perusahaan kepada akun ini.'
                ]);
            }
        }

        $data = $request->only(['username', 'email', 'roles_id', 'divisions_id', 'permission_matrix']);
        $data['password'] = Hash::make($request->password);

        // Security enforcement for PIC
        if ($user->role?->name === 'pic') {
            $usersFeatures = $user->permission_matrix['features']['users'] ?? [];
            if (!in_array('create', $usersFeatures)) {
                abort(403, 'Access Denied: You do not have permission to create users.');
            }

            $targetRole = Role::find($request->roles_id);
            if (!$targetRole || in_array($targetRole->name, ['admin_utama', 'admin_progres', 'pic', 'SuperAdmin'])) {
                abort(403, 'Access Denied: PIC tidak diizinkan membuat user dengan role ' . ($targetRole?->name ?? 'tersebut') . '.');
            }

            $companyIds = $user->companies_id ? [(int) $user->companies_id] : [];
        }

        $data['companies_id'] = !empty($companyIds) ? $companyIds[0] : null;
        $data['created_by'] = $user->id;
        $data['must_change_password'] = true;
        $newUser = User::create($data);

        // Synchronize pivot table
        $newUser->companies()->sync($companyIds);

        $multiCompanyNote = '';
        if (count($companyIds) > 1) {
            $compNames = Company::whereIn('id', $companyIds)->pluck('name')->implode(', ');
            $multiCompanyNote = " with multi-company access (approved: [{$compNames}])";
        }

        \App\Models\AuditLog::create([
            'user_id' => $user->id,
            'action' => 'CREATE_USER',
            'description' => "Created user {$newUser->username} ({$newUser->email}){$multiCompanyNote}",
            'ip_address' => $request->ip(),
        ]);

        return redirect()->back()->with('success', 'User created successfully.');
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();
        $targetUser = User::findOrFail($id);

        // Scope check for PIC
        if ($user->role?->name === 'pic') {
            $userCompanyIds = $user->getCompanyIds();
            $targetCompanyIds = $targetUser->getCompanyIds();
            $sharesCompany = !empty(array_intersect($userCompanyIds, $targetCompanyIds)) || 
                             ($user->companies_id && $targetUser->companies_id === $user->companies_id);

            if (!$sharesCompany) {
                abort(403, 'Unauthorized to edit this user.');
            }

            if (in_array($targetUser->role?->name, ['admin_utama', 'admin_progres', 'pic', 'SuperAdmin'])) {
                abort(403, 'Access Denied: PIC tidak diizinkan mengubah user dengan role ' . $targetUser->role?->name . '.');
            }
            
            $usersFeatures = $user->permission_matrix['features']['users'] ?? [];
            if (!in_array('edit', $usersFeatures)) {
                // PIC only has restricted access (e.g., to manage project access)
                $request->validate([
                    'permission_matrix' => 'nullable|array',
                ]);

                $currentMatrix = $targetUser->permission_matrix ?? [];
                $newMatrix = $request->permission_matrix ?? [];
                
                $currentMatrix['project_access'] = $newMatrix['project_access'] ?? [];
                
                // Handle sidebar (Module Access)
                $oldSidebar = $currentMatrix['sidebar'] ?? [];
                $hadUserMgmt = in_array('User Management', $oldSidebar);
                
                $newSidebar = $newMatrix['sidebar'] ?? [];
                $newSidebar = array_values(array_filter($newSidebar, function($item) {
                    return $item !== 'User Management';
                }));
                
                if ($hadUserMgmt) {
                    $newSidebar[] = 'User Management';
                }
                
                $currentMatrix['sidebar'] = $newSidebar;
                $currentMatrix['features'] = $newMatrix['features'] ?? [];
                
                $targetUser->update([
                    'permission_matrix' => $currentMatrix,
                    'last_modified_by' => $user->id
                ]);

                \App\Models\AuditLog::create([
                    'user_id' => $user->id,
                    'action' => 'UPDATE_PROJECT_ACCESS',
                    'description' => "Updated project access for user {$targetUser->username}",
                    'ip_address' => $request->ip(),
                ]);

                return redirect()->back()->with('success', 'Project access updated successfully.');
            }
        }

        if ($request->filled('email')) {
            $email = trim($request->email);
            if (!str_contains($email, '@')) {
                $email .= '@provis.id';
            }
            $request->merge(['email' => strtolower($email)]);
        }

        $request->validate([
            'username' => 'sometimes|required|string|max:45',
            'email' => ['sometimes', 'required', 'string', 'email', 'max:45', \Illuminate\Validation\Rule::unique('users', 'email')->ignore($targetUser->id)],
            'password' => 'nullable|string|min:8|regex:/[a-zA-Z]/|regex:/[0-9]/',
            'roles_id' => 'sometimes|required|integer|exists:roles,id',
            'companies_id' => 'nullable|integer|exists:companies,id',
            'company_ids' => 'nullable|array',
            'company_ids.*' => 'integer|exists:companies,id',
            'multi_company_agreement' => 'nullable|boolean',
            'divisions_id' => 'nullable|integer|exists:divisions,id',
            'permission_matrix' => 'nullable|array',
        ]);

        $companyIds = null;
        if ($request->has('company_ids')) {
            $companyIds = array_values(array_unique(array_filter(array_map('intval', (array) $request->input('company_ids', [])))));
        } elseif ($request->has('companies_id')) {
            $cid = $request->input('companies_id');
            $companyIds = $cid ? [(int) $cid] : [];
        }

        // Multi-company agreement check for Super Admin
        if ($companyIds !== null && count($companyIds) > 1) {
            if ($user->role?->name !== 'SuperAdmin') {
                abort(403, 'Hanya Super Admin yang diizinkan memberikan lebih dari 1 company.');
            }

            if (!$request->boolean('multi_company_agreement')) {
                return back()->withErrors([
                    'multi_company_agreement' => 'Persetujuan Super Admin wajib dicentang sebelum memberikan lebih dari 1 perusahaan kepada akun ini.'
                ]);
            }
        }

        $data = $request->only(['username', 'email', 'roles_id', 'divisions_id', 'permission_matrix']);
        
        if ($request->filled('password')) {
            $data['password'] = Hash::make($request->password);
        }

        if ($user->role?->name === 'pic') {
            if ($request->filled('roles_id')) {
                $targetRole = Role::find($request->roles_id);
                if (!$targetRole || in_array($targetRole->name, ['admin_utama', 'admin_progres', 'pic', 'SuperAdmin'])) {
                    abort(403, 'Access Denied: PIC tidak diizinkan menetapkan role ' . ($targetRole?->name ?? 'tersebut') . '.');
                }
            }
            // PIC retains target user's existing companies or user's company
        } elseif ($companyIds !== null) {
            $data['companies_id'] = !empty($companyIds) ? $companyIds[0] : null;
        }

        $data['last_modified_by'] = $user->id;
        $targetUser->update($data);

        // Sync pivot if modified by SuperAdmin
        if ($user->role?->name !== 'pic' && $companyIds !== null) {
            $targetUser->companies()->sync($companyIds);
        }

        $multiCompanyNote = '';
        if ($companyIds !== null && count($companyIds) > 1) {
            $compNames = Company::whereIn('id', $companyIds)->pluck('name')->implode(', ');
            $multiCompanyNote = " with multi-company access (approved: [{$compNames}])";
        }

        \App\Models\AuditLog::create([
            'user_id' => $user->id,
            'action' => 'UPDATE_USER',
            'description' => "Updated user {$targetUser->username}{$multiCompanyNote}",
            'ip_address' => $request->ip(),
        ]);

        return redirect()->back()->with('success', 'User updated successfully.');
    }

    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        $targetUser = User::findOrFail($id);

        if ($user->role?->name === 'pic') {
            abort(403, 'Access Denied: PICs are not allowed to delete users.');
        }

        $targetUser->delete();

        \App\Models\AuditLog::create([
            'user_id' => $user->id,
            'action' => 'DELETE_USER',
            'description' => "Deleted user {$targetUser->username} ({$targetUser->email})",
            'ip_address' => $request->ip(),
        ]);

        return redirect()->back()->with('success', 'User deleted successfully.');
    }
}
