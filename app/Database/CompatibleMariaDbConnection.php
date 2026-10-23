<?php

namespace App\Database;

use App\Database\Grammars\CompatibleMariaDbGrammar;
use Illuminate\Database\MariaDbConnection as BaseMariaDbConnection;

class CompatibleMariaDbConnection extends BaseMariaDbConnection
{
    /**
     * Get the default schema grammar instance.
     *
     * @return \Illuminate\Database\Schema\Grammars\MariaDbGrammar
     */
    protected function getDefaultSchemaGrammar()
    {
        return new CompatibleMariaDbGrammar($this);
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
