const value = useMemo(
  () => ({
    authReady,
    session,
    user,
    roles,
    bestRole,
    currentRole: bestRole, // 🔴 FIX CRÍTICO
    isRootOwner,
    orgs,
    currentOrg,
    setCurrentOrg,
    trackerDomain,
  }),
  [
    authReady,
    session,
    user,
    roles,
    bestRole,
    isRootOwner,
    orgs,
    currentOrg,
    trackerDomain,
  ]
);
