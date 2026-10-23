<?php

namespace App\Providers;

use App\Database\CompatibleMariaDbConnection;
use App\Database\CompatibleMySqlConnection;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Custom connection resolvers that use legacy-compatible SchemaGrammar
        // Fixes "1054 Unknown column 'generation_expression' in 'field list'" on older MySQL/MariaDB.
        Connection::resolverFor('mysql', function ($connection, $database, $prefix, $config) {
            return new CompatibleMySqlConnection($connection, $database, $prefix, $config);
        });

        Connection::resolverFor('mariadb', function ($connection, $database, $prefix, $config) {
            return new CompatibleMariaDbConnection($connection, $database, $prefix, $config);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Prevent key length errors on older MySQL / MariaDB (utf8mb4 with 767 byte index limit)
        Schema::defaultStringLength(191);
    }
}
