// src/context/OrgProvider.jsx
import React, { createContext, useContext, useState } from "react";

const OrgContext = createContext();

export const OrgProvider = ({ children }) => {
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [orgName, setOrgName] = useState(null);

  // Esta función es la que Geocercas.jsx espera:
  const setCurrentOrg = (orgId, name = null) => {
    setCurrentOrgId(orgId);
    if (name) setOrgName(name);
  };

  return (
    <OrgContext.Provider
      value={{
        currentOrgId,
        orgName,
        setCurrentOrg,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => useContext(OrgContext);
