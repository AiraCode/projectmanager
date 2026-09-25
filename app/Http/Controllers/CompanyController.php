<?php

namespace App\Http\Controllers;

use App\Models\Company;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CompanyController extends Controller
{
    public function store(Request $request)
    {
        $request->validate(['name' => 'required|string|max:255|unique:companies,name']);
        Company::create(['name' => $request->name]);
        return back()->with('success', 'Company created successfully.');
    }

    public function update(Request $request, $id)
    {
        $company = Company::findOrFail($id);
        $request->validate(['name' => 'required|string|max:255|unique:companies,name,' . $id]);
        $company->update(['name' => $request->name]);
        return back()->with('success', 'Company updated successfully.');
    }

    public function destroy($id)
    {
        $company = Company::findOrFail($id);
        // Only delete if no users or projects are attached
        if ($company->users()->count() > 0 || $company->projects()->count() > 0) {
            return back()->with('error', 'Cannot delete company with existing users or projects.');
        }
        $company->delete();
        return back()->with('success', 'Company deleted successfully.');
    }
}
