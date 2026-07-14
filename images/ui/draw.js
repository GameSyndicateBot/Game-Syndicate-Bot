const colors = require('./colors');

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function setFont(ctx, size, weight = 'bold', family = 'Arial') {
    ctx.font = `${weight} ${size}px ${family}`;
}

function fitText(ctx, text, maxWidth, fontSize, options = {}) {
    const {
        minSize = 14,
        weight = 'bold',
        family = 'Arial',
        ellipsis = true,
    } = options;

    const value = String(text ?? '');
    let size = fontSize;

    while (size > minSize) {
        setFont(ctx, size, weight, family);

        if (ctx.measureText(value).width <= maxWidth) {
            return {
                text: value,
                size,
            };
        }

        size -= 2;
    }

    setFont(ctx, size, weight, family);

    if (!ellipsis) {
        return {
            text: value,
            size,
        };
    }

    let clipped = value;

    while (clipped.length > 2 && ctx.measureText(`${clipped}…`).width > maxWidth) {
        clipped = clipped.slice(0, -1);
    }

    return {
        text: clipped.length < value.length ? `${clipped}…` : clipped,
        size,
    };
}

function drawAutoText(ctx, text, x, y, maxWidth, fontSize, options = {}) {
    const fitted = fitText(ctx, text, maxWidth, fontSize, options);

    setFont(
        ctx,
        fitted.size,
        options.weight ?? 'bold',
        options.family ?? 'Arial'
    );

    ctx.fillText(fitted.text, x, y);

    return fitted;
}

function drawBackground(ctx, width, height, watermark = 'GS') {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, colors.backgroundTop);
    bg.addColorStop(0.45, colors.backgroundMiddle);
    bg.addColorStop(1, colors.backgroundBottom);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.055;
    ctx.fillStyle = colors.purpleLight;
    ctx.font = 'bold 260px Arial';
    ctx.fillText(watermark, width * 0.58, height * 0.34);
    ctx.globalAlpha = 1;

    for (let i = 0; i < 70; i++) {
        const x = (i * 151) % width;
        const y = (i * 83) % height;
        const radius = 1.5 + (i % 4);

        ctx.globalAlpha = 0.06 + (i % 5) * 0.015;
        ctx.fillStyle = colors.purpleLight;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
}

function drawFrame(ctx, width, height) {
    ctx.strokeStyle = colors.purple;
    ctx.lineWidth = 6;
    roundRect(ctx, 35, 35, width - 70, height - 70, 36);
    ctx.stroke();

    ctx.shadowColor = colors.violet;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = colors.purpleLight;
    ctx.lineWidth = 2;
    roundRect(ctx, 58, 58, width - 116, height - 116, 26);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawHeader(ctx, title, subtitle, width) {
    ctx.fillStyle = colors.white;
    drawAutoText(ctx, title, 90, 115, width - 260, 48, {
        minSize: 30,
    });

    ctx.fillStyle = colors.violet;
    drawAutoText(ctx, subtitle, 90, 153, width - 260, 25, {
        minSize: 16,
    });

    ctx.fillStyle = colors.purpleLight;
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('GS', width - 90, 120);
    ctx.textAlign = 'left';
}

function drawPanel(ctx, x, y, w, h, options = {}) {
    const radius = options.radius ?? 24;

    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = options.fill ?? colors.panel;
    ctx.fill();

    ctx.strokeStyle = options.stroke ?? 'rgba(192, 132, 252, 0.35)';
    ctx.lineWidth = options.lineWidth ?? 2;
    ctx.stroke();
}

function drawStatBox(ctx, x, y, w, h, label, value, accent = colors.purpleLight, options = {}) {
    drawPanel(ctx, x, y, w, h, {
        fill: options.fill ?? 'rgba(139, 92, 246, 0.10)',
        stroke: options.stroke ?? 'rgba(192, 132, 252, 0.42)',
        radius: options.radius ?? 22,
        lineWidth: options.lineWidth ?? 2,
    });

    const paddingX = options.paddingX ?? 28;
    const maxTextWidth = Math.max(40, w - paddingX * 2);

    ctx.fillStyle = colors.muted;
    drawAutoText(ctx, label, x + paddingX, y + 38, maxTextWidth, options.labelSize ?? 22, {
        minSize: 14,
    });

    ctx.fillStyle = accent;

    const valueText = String(value ?? '');
    const valueBaseSize = options.valueSize ?? (h <= 95 ? 40 : 46);
    const valueMinSize = options.valueMinSize ?? 22;

    const fitted = fitText(ctx, valueText, maxTextWidth, valueBaseSize, {
        minSize: valueMinSize,
        ellipsis: false,
    });

    setFont(ctx, fitted.size, 'bold', 'Arial');

    const valueY = options.valueY ?? (
        h <= 95
            ? y + Math.min(h - 18, 74)
            : y + Math.min(h - 25, 92)
    );

    ctx.fillText(valueText, x + paddingX, valueY);
}

function drawProgressBar(ctx, x, y, w, h, current, total, accent = colors.violet) {
    const progress = total > 0 ? Math.min(current / total, 1) : 0;

    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = colors.dark;
    ctx.fill();

    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, colors.purple);
    grad.addColorStop(0.6, accent);
    grad.addColorStop(1, colors.gold);

    roundRect(ctx, x, y, Math.max(h, w * progress), h, h / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
}

function drawTag(ctx, x, y, text, accent = colors.purpleLight) {
    const paddingX = 20;
    const safeText = String(text ?? '');

    ctx.font = 'bold 20px Arial';
    const w = ctx.measureText(safeText).width + paddingX * 2;

    roundRect(ctx, x, y, w, 38, 19);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.18)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = colors.white;
    ctx.fillText(safeText, x + paddingX, y + 26);

    return w;
}

module.exports = {
    roundRect,
    setFont,
    fitText,
    drawAutoText,
    drawBackground,
    drawFrame,
    drawHeader,
    drawPanel,
    drawStatBox,
    drawProgressBar,
    drawTag,
};
