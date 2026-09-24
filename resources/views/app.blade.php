<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>PROVIS Project Manager</title>
        @viteReactRefresh
        @vite(['resources/js/index.css', 'resources/js/main.tsx'])
        @inertiaHead
        <script>
            function displayError(message, stack) {
                document.addEventListener('DOMContentLoaded', function() {
                    document.body.innerHTML = '<div style="color:red; padding:20px; font-family:monospace; white-space:pre-wrap;">' + 
                        '<h3>Client-side Error:</h3>' + 
                        message + '<br>' + (stack || '') + 
                        '</div>';
                });
            }
            window.onerror = function(message, source, lineno, colno, error) {
                displayError(message, error ? error.stack : '');
            };
            window.addEventListener('unhandledrejection', function(event) {
                displayError(event.reason, event.reason ? event.reason.stack : '');
            });
        </script>
    </head>
    <body class="antialiased">
        @inertia
    </body>
</html>
