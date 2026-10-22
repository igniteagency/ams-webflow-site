import { CountUp } from 'countup.js';

const calculateDuration = (value: number): number => {
  const absValue = Math.abs(value);
  const baseDuration = Math.log10(absValue + 1) * 0.8 + 1;
  return Math.min(baseDuration, 5);
};

const initCounters = (): void => {
  const counterElements = document.querySelectorAll<HTMLElement>('[data-el="counter"]');

  counterElements.forEach((element) => {
    // Avoid double initialization
    if (element.getAttribute('data-counter-initialized')) return;

    const originalText = element.textContent || '';
    // Regex to match numbers: supports optional negative sign, commas, and decimals
    const numberRegex = /(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)/g;

    const parts = originalText.split(numberRegex);
    if (parts.length <= 1) return; // No numbers found

    let resultHtml = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Non-number text (even indices in split with capturing group)
        resultHtml += parts[i];
      } else {
        // Number match (odd indices)
        const val = parts[i];
        resultHtml += `<span class="countup-num" data-val="${val}">${val}</span>`;
      }
    }

    element.innerHTML = resultHtml;
    element.setAttribute('data-counter-initialized', 'true');

    const numSpans = element.querySelectorAll<HTMLElement>('.countup-num');
    numSpans.forEach((span) => {
      const rawVal = span.dataset.val || '0';
      // Strip commas for parsing
      const endValue = parseFloat(rawVal.replace(/,/g, '')) || 0;
      const duration = calculateDuration(endValue);

      // Determine decimal places from the raw value
      const decimalPlaces = rawVal.includes('.')
        ? rawVal.split('.')[1].replace(/[^\d]/g, '').length
        : 0;

      const countUp = new CountUp(span, endValue, {
        startVal: 0,
        duration,
        decimalPlaces,
        enableScrollSpy: true,
        scrollSpyOnce: true,
        useGrouping: rawVal.includes(','),
      });

      if (countUp.error) {
        console.error('CountUp error:', countUp.error);
      }
    });
  });
};

initCounters();
