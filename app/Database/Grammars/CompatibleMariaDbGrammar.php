<?php

namespace App\Database\Grammars;

use Illuminate\Database\Schema\Grammars\MariaDbGrammar;

class CompatibleMariaDbGrammar extends MariaDbGrammar
{
    /**
     * Compile the query to determine the list of columns.
     * Compatible with older MySQL (< 5.7.6) and MariaDB (< 10.2.5) where
     * `generation_expression` does not exist in `information_schema.columns`.
     *
     * @param  string|null  $schema
     * @param  string  $table
     * @return string
     */
    public function compileColumns($schema, $table)
    {
        return sprintf(
            'select column_name as `name`, data_type as `type_name`, column_type as `type`, '
            .'collation_name as `collation`, is_nullable as `nullable`, '
            .'column_default as `default`, column_comment as `comment`, '
            ."null as `expression`, extra as `extra` "
            .'from information_schema.columns where table_schema = %s and table_name = %s '
            .'order by ordinal_position asc',
            $schema ? $this->quoteString($schema) : 'schema()',
            $this->quoteString($table)
        );
    }
}
