export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;

  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

export function calculateSkillOverlap(
  agentSkills: readonly string[],
  requiredSkills: readonly string[],
): number {
  if (requiredSkills.length === 0) return 1;

  const matched = requiredSkills.filter((s) => agentSkills.includes(s));
  return matched.length / requiredSkills.length;
}
