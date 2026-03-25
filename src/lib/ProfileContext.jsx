import React, { createContext, useContext } from "react";

const ProfileContext = createContext(null);

export function useCurrentProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useCurrentProfile must be used within a ProfileProvider");
  }
  return context;
}

export function ProfileProvider({ children, profileMgr }) {
  return (
    <ProfileContext.Provider value={profileMgr.currentProfile}>
      {children}
    </ProfileContext.Provider>
  );
}