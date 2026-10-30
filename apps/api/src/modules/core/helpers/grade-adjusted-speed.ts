/** Grades beyond this are GPS or altitude noise, not terrain */
const MAX_GRADE = 0.3;

/**
 * Energy cost of running at a grade (fraction, 0.1 for 10%), in J/kg/m.
 *
 * Source: Minetti et al. 2002, doi:10.1152/japplphysiol.01177.2001. Measured
 * on a treadmill between -45% and +45%: it knows nothing of technical terrain.
 */
export function runningEnergyCost(grade: number): number {
  const i = grade;
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    3.6
  );
}

/** Flat speed that costs the same energy as `speed` at `grade`. */
export function gradeAdjustedSpeed(speed: number, grade: number): number {
  const clamped = Math.max(-MAX_GRADE, Math.min(MAX_GRADE, grade));
  return (speed * runningEnergyCost(clamped)) / runningEnergyCost(0);
}
