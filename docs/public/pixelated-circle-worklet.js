// Runs in the CSS Paint Worklet global scope, not as an application module.
class PixelatedCirclePainter {
  static get inputProperties() {
    return [
      '--docs-reveal-x',
      '--docs-reveal-y',
      '--docs-reveal-radius',
      '--docs-pixel-size',
      '--docs-dissolve-amount',
    ];
  }

  hash(x, y) {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  paint(context, size, properties) {
    const readNumber = (name, fallback) => {
      const value = Number.parseFloat(properties.get(name));
      return Number.isNaN(value) ? fallback : value;
    };
    const centerX = readNumber('--docs-reveal-x', 32);
    const centerY = readNumber('--docs-reveal-y', 32);
    const radiusPercent = readNumber('--docs-reveal-radius', 0);
    const pixelSize = readNumber('--docs-pixel-size', 20);
    const dissolveAmount = Math.min(
      1,
      Math.max(0, readNumber('--docs-dissolve-amount', 0.65)),
    );
    const diagonal = Math.sqrt(size.width ** 2 + size.height ** 2);
    const baseRadius = (radiusPercent / 100) * diagonal;
    const radiusScale = dissolveAmount < 0.95 ? 1 / (1 - dissolveAmount) : 20;
    const radius = baseRadius * radiusScale;
    const innerEdge = radius * (1 - dissolveAmount);
    const fuzzyWidth = radius - innerEdge;

    for (let x = 0; x < size.width; x += pixelSize) {
      for (let y = 0; y < size.height; y += pixelSize) {
        const distance = Math.sqrt(
          (x + pixelSize / 2 - centerX) ** 2 +
            (y + pixelSize / 2 - centerY) ** 2,
        );
        let opacity = 0;

        if (distance <= innerEdge) {
          opacity = 1;
        } else if (distance <= radius && fuzzyWidth > 0) {
          const distanceOpacity = 1 - (distance - innerEdge) / fuzzyWidth;
          if (this.hash(x / pixelSize, y / pixelSize) < distanceOpacity) {
            opacity =
              distanceOpacity *
              (0.5 + 0.5 * this.hash(y / pixelSize, x / pixelSize));
          }
        }

        if (opacity > 0) {
          context.fillStyle = `rgba(0, 0, 0, ${opacity})`;
          context.fillRect(x, y, pixelSize, pixelSize);
        }
      }
    }
  }
}

registerPaint('docs-pixelated-circle', PixelatedCirclePainter);
