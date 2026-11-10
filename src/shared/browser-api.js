(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebTimizeBrowser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const namespace = root.browser?.runtime ? root.browser : root.chrome;

  function call(scope, method, ...args) {
    if (!scope || typeof scope[method] !== "function") {
      return Promise.reject(new Error(`browser API ${method} is unavailable`));
    }
    try {
      return Promise.resolve(scope[method](...args));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  const storage = {
    available: Boolean(namespace?.storage?.sync),
    get: (key) => call(namespace?.storage?.sync, "get", key),
    set: (value) => call(namespace?.storage?.sync, "set", value),
    onChanged: namespace?.storage?.onChanged
  };

  const runtime = {
    id: namespace?.runtime?.id,
    getURL: (path) => namespace.runtime.getURL(path),
    getManifest: () => namespace.runtime.getManifest(),
    sendMessage: (message) => call(namespace?.runtime, "sendMessage", message),
    openOptionsPage: () => call(namespace?.runtime, "openOptionsPage"),
    onInstalled: namespace?.runtime?.onInstalled,
    onStartup: namespace?.runtime?.onStartup,
    onMessage: namespace?.runtime?.onMessage
  };

  const tabs = {
    query: (query) => call(namespace?.tabs, "query", query),
    sendMessage: (tabId, message) => call(namespace?.tabs, "sendMessage", tabId, message)
  };

  const dnr = {
    available: Boolean(namespace?.declarativeNetRequest?.updateDynamicRules),
    getDynamicRules: () => call(namespace?.declarativeNetRequest, "getDynamicRules"),
    updateDynamicRules: (changes) => call(namespace?.declarativeNetRequest, "updateDynamicRules", changes)
  };

  return {
    isFirefox: Boolean(root.browser?.runtime),
    storage,
    runtime,
    tabs,
    dnr
  };
});
