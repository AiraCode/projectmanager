<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    /**
     * List all dynamic companies.
     */
    public function index(): JsonResponse
    {
        $companies = Company::withCount('projects')
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'address', 'created_at']);

        return response()->json([
            'companies' => $companies,
        ]);
    }

    /**
     * Store a newly created dynamic company.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! $user->isAdmin()) {
            return response()->json([
                'message' => 'Unauthorized. Only Admins can register new companies.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:companies,name'],
            'code' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:500'],
        ]);

        $company = Company::create($validated);

        return response()->json([
            'message' => 'Company created successfully',
            'company' => $company,
        ], 201);
    }
}
