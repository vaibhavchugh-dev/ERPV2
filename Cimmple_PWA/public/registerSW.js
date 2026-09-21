if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(
        regs.map(function (reg) {
          var scope = String(reg.scope || "");
          if (scope.indexOf("/shop") === -1) return reg.unregister();
          return Promise.resolve();
        })
      );
    }).then(function () {
      return navigator.serviceWorker.register("/shop/sw.js", { scope: "/shop/" });
    });
  });
}
