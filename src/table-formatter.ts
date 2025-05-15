// src/table-formatter.ts
/**
 * Simple table formatter that handles ANSI color codes correctly
 */
export function formatTable(data: Array<Record<string, any>>, options?: { title?: string }): void {
    if (!data || data.length === 0) {
        console.log('No data to display');
        return;
    }

    // Print the title if provided
    if (options?.title) {
        console.log(`\n${options.title}`);
    }

    // Extract all unique keys from the data
    const allKeys = new Set<string>();
    data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
    });
    const headers = Array.from(allKeys);

    // Function to get visible string length (excluding ANSI color codes)
    const getVisibleLength = (str: string): number => {
        // Remove ANSI color codes for width calculation
        return str.replace(/\x1B\[\d+m/g, '').length;
    };

    // Calculate the width of each column
    const colWidths: Record<string, number> = {};
    headers.forEach(header => {
        // Start with the header width
        colWidths[header] = header.length;

        // Check each row for this column's value and update width if needed
        data.forEach(row => {
            const value = row[header] !== undefined ? String(row[header]) : '';
            colWidths[header] = Math.max(colWidths[header], getVisibleLength(value));
        });
    });

    // Function to pad a string to desired visible length, accounting for ANSI codes
    const padString = (str: string, length: number, padChar = ' '): string => {
        const visibleLength = getVisibleLength(str);
        const paddingNeeded = Math.max(0, length - visibleLength);
        return str + padChar.repeat(paddingNeeded);
    };

    // Create the header row
    let headerRow = '│ ';
    headers.forEach((header, index) => {
        const isLast = index === headers.length - 1;
        headerRow += padString(header, colWidths[header]) + (isLast ? ' │' : ' │ ');
    });

    // Create a separator row
    let separator = '├─';
    headers.forEach((header, index) => {
        const isLast = index === headers.length - 1;
        separator += '─'.repeat(colWidths[header]) + (isLast ? '─┤' : '─┼─');
    });

    // Create the top border
    let topBorder = '┌─';
    headers.forEach((header, index) => {
        const isLast = index === headers.length - 1;
        topBorder += '─'.repeat(colWidths[header]) + (isLast ? '─┐' : '─┬─');
    });

    // Create the bottom border
    let bottomBorder = '└─';
    headers.forEach((header, index) => {
        const isLast = index === headers.length - 1;
        bottomBorder += '─'.repeat(colWidths[header]) + (isLast ? '─┘' : '─┴─');
    });

    // Print the table
    console.log(topBorder);
    console.log(headerRow);
    console.log(separator);

    // Print each data row
    data.forEach(row => {
        let dataRow = '│ ';
        headers.forEach((header, index) => {
            const isLast = index === headers.length - 1;
            const value = row[header] !== undefined ? String(row[header]) : '';
            dataRow += padString(value, colWidths[header]) + (isLast ? ' │' : ' │ ');
        });
        console.log(dataRow);
    });

    console.log(bottomBorder);
}