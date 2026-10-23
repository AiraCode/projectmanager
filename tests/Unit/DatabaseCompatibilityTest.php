<?php

namespace Tests\Unit;

use App\Database\CompatibleMariaDbConnection;
use App\Database\CompatibleMySqlConnection;
use App\Database\Grammars\CompatibleMariaDbGrammar;
use App\Database\Grammars\CompatibleMySqlGrammar;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use PDO;

class DatabaseCompatibilityTest extends BaseTestCase
{
    public function createApplication(): Application
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    public function test_compatible_mysql_grammar_omits_generation_expression(): void
    {
        $pdo = $this->createMock(PDO::class);
        $conn = new CompatibleMySqlConnection($pdo, 'test_db');

        $grammar = $conn->getSchemaGrammar();
        $this->assertInstanceOf(CompatibleMySqlGrammar::class, $grammar);

        $sql = $grammar->compileColumns(null, 'main_wbs');
        $this->assertStringNotContainsString('generation_expression', $sql);
        $this->assertStringContainsString('null as `expression`', $sql);

        $fluent = new \Illuminate\Support\Fluent();
        $refMethod = new \ReflectionMethod($grammar, 'typeJson');
        $refMethod->setAccessible(true);
        $this->assertEquals('longtext', $refMethod->invoke($grammar, $fluent));
    }

    public function test_compatible_mariadb_grammar_omits_generation_expression(): void
    {
        $pdo = $this->createMock(PDO::class);
        $conn = new CompatibleMariaDbConnection($pdo, 'test_db');

        $grammar = $conn->getSchemaGrammar();
        $this->assertInstanceOf(CompatibleMariaDbGrammar::class, $grammar);

        $sql = $grammar->compileColumns(null, 'main_wbs');
        $this->assertStringNotContainsString('generation_expression', $sql);
        $this->assertStringContainsString('null as `expression`', $sql);

        $fluent = new \Illuminate\Support\Fluent();
        $refMethod = new \ReflectionMethod($grammar, 'typeJson');
        $refMethod->setAccessible(true);
        $this->assertEquals('longtext', $refMethod->invoke($grammar, $fluent));
    }

    public function test_connection_resolver_resolves_compatible_connection(): void
    {
        $factory = app(\Illuminate\Database\Connectors\ConnectionFactory::class);
        $pdo = $this->createMock(PDO::class);

        $method = new \ReflectionMethod($factory, 'createConnection');
        $method->setAccessible(true);

        $conn = $method->invoke($factory, 'mysql', $pdo, 'test_db', '', []);
        $this->assertInstanceOf(CompatibleMySqlConnection::class, $conn);
        $this->assertInstanceOf(CompatibleMySqlGrammar::class, $conn->getSchemaGrammar());
    }
}
