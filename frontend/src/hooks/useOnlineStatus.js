import { useState, useEffect } from "react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Listen for sync messages from service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SYNC_COMPLETE") {
          checkPendingRequests();
        }
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Check IndexedDB for pending requests count
  const checkPendingRequests = () => {
    const request = indexedDB.open("ShadowCakesOffline", 1);
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains("pendingRequests")) {
        const tx = db.transaction("pendingRequests", "readonly");
        const store = tx.objectStore("pendingRequests");
        const countReq = store.count();
        countReq.onsuccess = () => setPendingCount(countReq.result);
      }
      db.close();
    };
  };

  useEffect(() => {
    checkPendingRequests();
    const interval = setInterval(checkPendingRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  return { isOnline, pendingCount };
}
