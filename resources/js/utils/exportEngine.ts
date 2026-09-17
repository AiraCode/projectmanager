export function exportToCSV(filename: string, headers: string[], rows: any[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      row.map(cell => {
        const cellString = cell === null || cell === undefined ? '' : String(cell);
        // Escape quotes and wrap in quotes if contains comma or newline
        if (cellString.includes(',') || cellString.includes('"') || cellString.includes('\n')) {
          return `"${cellString.replace(/"/g, '""')}"`;
        }
        return cellString;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
