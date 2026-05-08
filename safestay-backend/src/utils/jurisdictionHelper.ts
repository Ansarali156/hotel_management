// Returns a LIKE pattern to match all sub-jurisdictions
// e.g., officer at District level "s1/z2/r3/d4"
// matches "s1/z2/r3/d4", "s1/z2/r3/d4/st5", "s1/z2/r3/d4/st6" etc.
export const buildJurisdictionFilter = (path: string): string => {
  return `${path}%`; // Used in Prisma: { jurisdictionPath: { startsWith: path } }
};

export const isSubJurisdiction = (officerPath: string, resourcePath: string): boolean => {
  return resourcePath.startsWith(officerPath);
};
