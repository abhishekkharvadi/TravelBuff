export function getDayColor(dIdx) {
  if (dIdx < 0 || dIdx === undefined || dIdx === null || isNaN(dIdx)) return '#8b5cf6';
  const baseColors = [
    '#3b82f6', // Day 1: Blue
    '#10b981', // Day 2: Emerald Green
    '#8b5cf6', // Day 3: Purple
    '#f59e0b', // Day 4: Amber
    '#ec4899', // Day 5: Pink
    '#14b8a6', // Day 6: Teal
    '#ef4444', // Day 7: Red
    '#6366f1', // Day 8: Indigo
    '#84cc16', // Day 9: Lime
    '#06b6d4', // Day 10: Cyan
    '#f97316', // Day 11: Orange
    '#a855f7', // Day 12: Violet
    '#0284c7', // Day 13: Sky
    '#d97706'  // Day 14: Dark Amber
  ];
  if (dIdx < baseColors.length) return baseColors[dIdx];
  
  // Golden ratio hue distribution for Day 15+
  const hue = (dIdx * 137.5) % 360;
  return `hsl(${Math.round(hue)}, 75%, 48%)`;
}
