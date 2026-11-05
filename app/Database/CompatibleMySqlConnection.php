<?php

namespace App\Database;

use App\Database\Grammars\CompatibleMySqlGrammar;
use Illuminate\Database\MySqlConnection as BaseMySqlConnection;

class CompatibleMySqlConnection extends BaseMySqlConnection
{
    /**
     * Get the default schema grammar instance.
     *
     * @return \Illuminate\Database\Schema\Grammars\MySqlGrammar
     */
    protected function getDefaultSchemaGrammar()
    {
        return new CompatibleMySqlGrammar($this);
    }

    /**
     * Get the schema grammar used by the connection.
     *
     * @return \Illuminate\Database\Schema\Grammars\Grammar
     */
    public function getSchemaGrammar()
    {
        if (is_null($this->schemaGrammar)) {
            $this->useDefaultSchemaGrammar();
        }

        return $this->schemaGrammar;
    }
}
