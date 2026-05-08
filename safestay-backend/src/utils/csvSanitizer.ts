/**
 * CSV injection protection utility.
 *
 * Cells starting with =, +, -, or @ are formula injection vectors in
 * spreadsheet applications.  Prefix them with a tab character (\t) so they
 * are treated as plain text rather than evaluated as formulas.
 *
 * Reference: OWASP — CSV Injection
 * https://owasp.org/www-community/attacks/CSV_Injection
 */

const DANGEROUS_PREFIXES = /^[=+\-@]/;

/**
 * Sanitizes a single CSV field value.
 * Pass any cell content through this before writing to a CSV export.
 */
export const sanitizeCsvField = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return DANGEROUS_PREFIXES.test(str) ? `\t${str}` : str;
};

/**
 * Sanitizes an entire row (array of values).
 */
export const sanitizeCsvRow = (row: unknown[]): string[] =>
  row.map(sanitizeCsvField);

/**
 * Converts an array of objects to a CSV string with injection protection.
 * Columns are derived from the keys of the first object.
 */
export const objectsToCsv = <T extends Record<string, unknown>>(rows: T[]): string => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(sanitizeCsvField).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => `"${sanitizeCsvField(row[h]).replace(/"/g, '""')}"`).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n');
};
