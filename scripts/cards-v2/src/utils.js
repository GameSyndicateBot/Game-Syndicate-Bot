'use strict';

function escapeXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function wrapText(text, maxChars = 30) {
    const words = String(text ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const candidate = currentLine
            ? `${currentLine} ${word}`
            : word;

        if (candidate.length <= maxChars) {
            currentLine = candidate;
            continue;
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        currentLine = word;
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines;
}

function textNode({
    x,
    y,
    text,
    size,
    fill,
    weight = 600,
    anchor = 'start',
    family = 'DejaVu Sans Condensed, Arial Narrow, Arial, sans-serif',
    letterSpacing = 0,
}) {
    return `
        <text
            x="${x}"
            y="${y}"
            text-anchor="${anchor}"
            font-family="${family}"
            font-size="${size}"
            font-weight="${weight}"
            letter-spacing="${letterSpacing}"
            fill="${fill}"
        >
            ${escapeXml(text)}
        </text>
    `;
}

function multilineNode({
    x,
    y,
    lines,
    size,
    lineHeight,
    fill,
    weight = 400,
    maxLines = 10,
    anchor = 'start',
    family = 'DejaVu Sans Condensed, Arial Narrow, Arial, sans-serif',
}) {
    return (lines ?? [])
        .slice(0, maxLines)
        .map((line, index) => textNode({
            x,
            y: y + index * lineHeight,
            text: line,
            size,
            fill,
            weight,
            anchor,
            family,
        }))
        .join('\n');
}

module.exports = {
    escapeXml,
    wrapText,
    textNode,
    multilineNode,
};