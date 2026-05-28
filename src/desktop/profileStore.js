import React, { useState, useCallback, useContext, createContext } from "react";
import { DEFAULT_DESKTOP_ICONS, DEFAULT_PINNED } from "@/desktop/desktopApps";

const ProfileContext = createContext(null);

const DEFAULT_PROFILE = {
  id: "default",
  name: "Primary",
  type: "business",
  enterpriseId: null,
  theme: {
    wallpaperIdx: 0,
    accentColor: "#10b981",
  },
  desktopIcons: DEFAULT_DESKTOP_ICONS,
  pinnedApps: DEFAULT_PINNED,
};

function loadProfiles() {
  try {
    const raw = localStorage.getItem("desktop_profiles");
    return raw ? JSON.parse(raw) : [DEFAULT_PROFILE];
  } catch {
    return [DEFAULT_PROFILE];
  }
}

function saveProfiles(profiles) {
  try {
    localStorage.setItem("desktop_profiles", JSON.stringify(profiles));
  } catch {
    console.error("Failed to save profiles");
  }
}

export function useProfileStore() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [currentProfileId, setCurrentProfileId] = useState(() => {
    try {
      const saved = localStorage.getItem("current_profile_id");
      return saved || profiles[0]?.id || DEFAULT_PROFILE.id;
    } catch {
      return profiles[0]?.id || DEFAULT_PROFILE.id;
    }
  });

  const currentProfile = profiles.find((p) => p.id === currentProfileId) || profiles[0];

  // Add profile
  const addProfile = useCallback(
    (name, type, enterpriseId) => {
      const id = `profile_${Date.now()}`;
      const newProfile = {
        id,
        name,
        type,
        enterpriseId,
        theme: {
          wallpaperIdx: 0,
          accentColor: "#10b981",
        },
        desktopIcons: DEFAULT_PROFILE.desktopIcons.slice(),
        pinnedApps: DEFAULT_PROFILE.pinnedApps.slice(),
      };
      const next = [...profiles, newProfile];
      setProfiles(next);
      saveProfiles(next);
      return newProfile;
    },
    [profiles]
  );

  // Delete profile
  const deleteProfile = useCallback(
    (id) => {
      if (profiles.length === 1) {
        console.warn("Cannot delete the last profile");
        return;
      }
      const next = profiles.filter((p) => p.id !== id);
      setProfiles(next);
      saveProfiles(next);
      if (currentProfileId === id) {
        switchProfile(next[0].id);
      }
    },
    [profiles, currentProfileId]
  );

  // Switch profile
  const switchProfile = useCallback((id) => {
    const exists = profiles.some((p) => p.id === id);
    if (exists) {
      setCurrentProfileId(id);
      try {
        localStorage.setItem("current_profile_id", id);
      } catch {
        console.error("Failed to save current profile ID");
      }
    }
  }, [profiles]);

  // Update profile
  const updateProfile = useCallback(
    (id, updates) => {
      const next = profiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      );
      setProfiles(next);
      saveProfiles(next);
    },
    [profiles]
  );

  // Update profile theme
  const updateProfileTheme = useCallback(
    (id, themeUpdates) => {
      const next = profiles.map((p) =>
        p.id === id
          ? { ...p, theme: { ...p.theme, ...themeUpdates } }
          : p
      );
      setProfiles(next);
      saveProfiles(next);
    },
    [profiles]
  );

  // Update desktop icons
  const updateDesktopIcons = useCallback(
    (id, icons) => {
      const next = profiles.map((p) =>
        p.id === id ? { ...p, desktopIcons: icons } : p
      );
      setProfiles(next);
      saveProfiles(next);
    },
    [profiles]
  );

  // Update pinned apps
  const updatePinnedApps = useCallback(
    (id, apps) => {
      const next = profiles.map((p) =>
        p.id === id ? { ...p, pinnedApps: apps } : p
      );
      setProfiles(next);
      saveProfiles(next);
    },
    [profiles]
  );

  return {
    profiles,
    currentProfileId,
    currentProfile,
    switchProfile,
    addProfile,
    deleteProfile,
    updateProfile,
    updateProfileTheme,
    updateDesktopIcons,
    updatePinnedApps,
  };
}

export { ProfileContext };
