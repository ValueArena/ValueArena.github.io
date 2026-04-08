function initTabs() {
  const tabs = document.querySelectorAll(".sidebar-item");
  const panes = document.querySelectorAll(".tab-pane");
  const sidebar = document.getElementById("sidebar");

  function activate(id) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === id));
    panes.forEach(p => p.classList.toggle("active", p.id === "tab-" + id));
    localStorage.setItem("va-active-tab", id);
    window.dispatchEvent(new CustomEvent("va-tab", { detail: id }));
    // Auto-close sidebar on mobile after selection
    if (window.innerWidth <= 768 && sidebar) sidebar.classList.remove("open");
  }

  tabs.forEach(t => {
    t.onclick = () => {
      history.replaceState(null, "", "#" + t.dataset.tab);
      // "New Chat" button resets chat state when already on chat tab
      if (t.dataset.tab === "chat" && typeof resetChat === "function") {
        activate("chat");
        resetChat();
        return;
      }
      activate(t.dataset.tab);
    };
  });

  // Defer initial activation until all scripts have loaded
  const hash = location.hash.replace("#", "") || localStorage.getItem("va-active-tab") || "chat";
  window._activateTab = () => activate(hash);
}

initTabs();
